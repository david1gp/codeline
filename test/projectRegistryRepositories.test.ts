import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { projectFolderRepositoryCreate } from "../src/project/db/projectFolderRepositoryCreate.js"
import { projectFolderRepositoryDelete } from "../src/project/db/projectFolderRepositoryDelete.js"
import { projectFolderRepositoryList } from "../src/project/db/projectFolderRepositoryList.js"
import { projectFolderRepositoryUpdate } from "../src/project/db/projectFolderRepositoryUpdate.js"
import { projectFolderStatusList } from "../src/project/db/projectFolderStatusList.js"
import { projectRegistryRepositoryDelete } from "../src/project/db/projectRegistryRepositoryDelete.js"
import { projectRegistryRepositoryList } from "../src/project/db/projectRegistryRepositoryList.js"
import { projectRegistryRepositoryMove } from "../src/project/db/projectRegistryRepositoryMove.js"
import { projectRegistryRepositoryResolve } from "../src/project/db/projectRegistryRepositoryResolve.js"
import { projectRegistryRepositoryUpdate } from "../src/project/db/projectRegistryRepositoryUpdate.js"
import { projectRegistryRepositoryUpsert } from "../src/project/db/projectRegistryRepositoryUpsert.js"
import { projectTable } from "../src/project/db/projectTable.js"
import { projectRegistryPathCanonicalize } from "../src/project/projectRegistryPathCanonicalize.js"
import { runTable } from "../src/run/db/runTable.js"
import type { RunExecutionSnapshot } from "../src/run/schema/runExecutionSnapshotSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { sessionViewTable } from "../src/session/db/sessionViewTable.js"

const runSnapshotCreate = (agentId: string, serverId: string): RunExecutionSnapshot => ({
  configuration: {
    model: "project-registry-test-model",
    provider: "deterministic",
    tools: { bash: false, webfetch: false },
  },
  configurationRevision: "project-registry-test-revision",
  target: { agentId, serverId },
})

async function temporaryDatabaseCreate() {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-repositories."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const migrated = await databaseMigrate(filePath)
  if (!migrated.success) {
    await rm(directoryPath, { force: true, recursive: true })
    throw new Error(migrated.errorMessage)
  }

  const connection = databaseConnectionCreate(filePath)
  return {
    database: connection.db,
    dispose: async () => {
      connection.client.close()
      await rm(directoryPath, { force: true, recursive: true })
    },
  }
}

const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test("project registry canonical paths retain their safety rules", async () => {
  const rootsDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-canonical."))
  const projectPath = path.join(rootsDirectory, "project")
  const outsidePath = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-outside."))
  const symlinkPath = path.join(rootsDirectory, "linked-project")
  const filePath = path.join(rootsDirectory, "project-file")

  try {
    await mkdir(projectPath)
    await symlink(projectPath, symlinkPath)
    await writeFile(filePath, "not a directory")

    const canonical = await projectRegistryPathCanonicalize(path.join(projectPath, "."), [rootsDirectory])
    expect(canonical).toEqual({ success: true, data: projectPath })
    expect((await projectRegistryPathCanonicalize("relative-project", [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize("~", [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(symlinkPath, [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(outsidePath, [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(filePath, [rootsDirectory])).success).toBe(false)
  } finally {
    await rm(rootsDirectory, { force: true, recursive: true })
    await rm(outsidePath, { force: true, recursive: true })
  }
})

test("project registry repositories isolate users across every operation", async () => {
  const fixture = await temporaryDatabaseCreate()
  const projectPath = path.resolve("/tmp/codeline-project-registry-shared")
  const secondProjectPath = path.resolve("/tmp/codeline-project-registry-second")
  const firstUserId = "project-registry-repository-user-one"
  const secondUserId = "project-registry-repository-user-two"

  try {
    await fixture.database.insert(applicationUserTable).values([
      { id: firstUserId, displayName: "Project Registry Repository User One" },
      { id: secondUserId, displayName: "Project Registry Repository User Two" },
    ])

    const firstProject = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, {
      displayName: "First User Project",
      path: projectPath,
    })
    const secondProject = await projectRegistryRepositoryUpsert(fixture.database, secondUserId, {
      displayName: "Second User Project",
      path: projectPath,
    })
    const firstSecondProject = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, {
      path: secondProjectPath,
    })
    expect(firstProject.success).toBe(true)
    expect(secondProject.success).toBe(true)
    expect(firstSecondProject.success).toBe(true)
    if (!firstProject.success || !secondProject.success || !firstSecondProject.success) return

    expect(firstProject.data.id).toMatch(uuidv7Pattern)
    expect(secondProject.data.id).toMatch(uuidv7Pattern)
    expect(firstProject.data.id).not.toBe(secondProject.data.id)

    const preservedName = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, { path: projectPath })
    expect(preservedName).toMatchObject({
      success: true,
      data: {
        createdAt: firstProject.data.createdAt,
        displayName: "First User Project",
        id: firstProject.data.id,
        path: projectPath,
      },
    })
    if (!preservedName.success) return
    expect(preservedName.data.displayName).toBe("First User Project")
    expect(preservedName.data.id).toBe(firstProject.data.id)

    const firstProjects = await projectRegistryRepositoryList(fixture.database, firstUserId)
    const secondProjects = await projectRegistryRepositoryList(fixture.database, secondUserId)
    expect(firstProjects.success).toBe(true)
    expect(secondProjects.success).toBe(true)
    if (!firstProjects.success || !secondProjects.success) return
    expect(firstProjects.data.map((project) => project.path).sort()).toEqual([projectPath, secondProjectPath].sort())
    expect(secondProjects.data.map((project) => project.path)).toEqual([projectPath])

    expect(await projectRegistryRepositoryResolve(fixture.database, firstUserId, secondProject.data.id)).toMatchObject({
      success: false,
    })
    expect(await projectRegistryRepositoryResolve(fixture.database, secondUserId, firstProject.data.id)).toMatchObject({
      success: false,
    })

    const updated = await projectRegistryRepositoryUpdate(fixture.database, firstUserId, firstProject.data.id, {
      displayName: null,
    })
    expect(updated).toMatchObject({
      success: true,
      data: { id: firstProject.data.id, path: projectPath, displayName: null },
    })
    expect(
      await projectRegistryRepositoryUpdate(fixture.database, secondUserId, firstProject.data.id, {
        displayName: "Should not update",
      }),
    ).toMatchObject({ success: false })

    expect(await projectRegistryRepositoryDelete(fixture.database, firstUserId, secondProject.data.id)).toMatchObject({
      success: false,
    })
    expect(await projectRegistryRepositoryDelete(fixture.database, firstUserId, firstProject.data.id)).toMatchObject({
      success: true,
    })
    expect(await projectRegistryRepositoryResolve(fixture.database, secondUserId, secondProject.data.id)).toMatchObject(
      {
        success: true,
        data: { id: secondProject.data.id, path: projectPath, displayName: "Second User Project" },
      },
    )
  } finally {
    await fixture.dispose()
  }
})

test("project folders enforce ownership and unique names across CRUD and assignment", async () => {
  const fixture = await temporaryDatabaseCreate()
  const firstUserId = "project-folder-repository-user-one"
  const secondUserId = "project-folder-repository-user-two"
  const projectPath = path.resolve("/tmp/codeline-project-folder-repository-project")

  try {
    await fixture.database.insert(applicationUserTable).values([
      { id: firstUserId, displayName: "Project Folder Repository User One" },
      { id: secondUserId, displayName: "Project Folder Repository User Two" },
    ])

    const firstFolder = await projectFolderRepositoryCreate(fixture.database, firstUserId, { name: "Workspace" })
    const secondFolder = await projectFolderRepositoryCreate(fixture.database, firstUserId, { name: "Personal" })
    const otherUserFolder = await projectFolderRepositoryCreate(fixture.database, secondUserId, { name: "Workspace" })
    expect(firstFolder.success).toBe(true)
    expect(secondFolder.success).toBe(true)
    expect(otherUserFolder.success).toBe(true)
    if (!firstFolder.success || !secondFolder.success || !otherUserFolder.success) return

    expect(await projectFolderRepositoryCreate(fixture.database, firstUserId, { name: " Workspace " })).toMatchObject({
      success: false,
      errorMessage: "The project folder name is already in use.",
    })
    expect(
      await projectFolderRepositoryUpdate(fixture.database, firstUserId, firstFolder.data.id, { name: "Personal" }),
    ).toMatchObject({
      success: false,
      errorMessage: "The project folder name is already in use.",
    })
    expect(
      await projectFolderRepositoryUpdate(fixture.database, firstUserId, firstFolder.data.id, { name: "Workspace" }),
    ).toMatchObject({
      success: true,
    })

    const firstFolders = await projectFolderRepositoryList(fixture.database, firstUserId)
    const secondFolders = await projectFolderRepositoryList(fixture.database, secondUserId)
    expect(firstFolders.success).toBe(true)
    expect(secondFolders.success).toBe(true)
    if (!firstFolders.success || !secondFolders.success) return
    expect(firstFolders.data.map((folder) => folder.name).sort()).toEqual(["Personal", "Workspace"])
    expect(secondFolders.data.map((folder) => folder.name)).toEqual(["Workspace"])

    const project = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, { path: projectPath })
    expect(project.success).toBe(true)
    if (!project.success) return

    expect(
      await projectRegistryRepositoryMove(fixture.database, secondUserId, project.data.id, {
        folderId: otherUserFolder.data.id,
      }),
    ).toMatchObject({ success: false })
    expect(
      await projectRegistryRepositoryMove(fixture.database, firstUserId, project.data.id, {
        folderId: otherUserFolder.data.id,
      }),
    ).toMatchObject({ success: false })

    const moved = await projectRegistryRepositoryMove(fixture.database, firstUserId, project.data.id, {
      folderId: firstFolder.data.id,
    })
    expect(moved).toMatchObject({ success: true, data: { parentFolderId: firstFolder.data.id } })
    const unassigned = await projectRegistryRepositoryMove(fixture.database, firstUserId, project.data.id, {
      folderId: null,
    })
    expect(unassigned).toMatchObject({ success: true, data: { parentFolderId: null } })

    const reassigned = await projectRegistryRepositoryMove(fixture.database, firstUserId, project.data.id, {
      folderId: firstFolder.data.id,
    })
    expect(reassigned.success).toBe(true)
    const deleted = await projectFolderRepositoryDelete(fixture.database, firstUserId, firstFolder.data.id)
    expect(deleted).toMatchObject({ success: true, data: { id: firstFolder.data.id } })
    expect(await fixture.database.select({ parentFolderId: projectTable.parentFolderId }).from(projectTable)).toEqual([
      { parentFolderId: null },
    ])
    expect(await projectFolderRepositoryDelete(fixture.database, secondUserId, firstFolder.data.id)).toMatchObject({
      success: false,
    })
  } finally {
    await fixture.dispose()
  }
})

test("project folder statuses aggregate only current user's non-archived sessions in the current organization", async () => {
  const fixture = await temporaryDatabaseCreate()
  const userId = "project-folder-status-user"
  const otherUserId = "project-folder-status-other-user"
  const organizationId = "project-folder-status-organization"
  const otherOrganizationId = "project-folder-status-other-organization"
  const serverId = "project-folder-status-server"
  const otherServerId = "project-folder-status-other-server"
  const otherOrganizationServerId = "project-folder-status-other-organization-server"
  const agentId = "project-folder-status-agent"
  const otherOrganizationAgentId = "project-folder-status-other-organization-agent"
  const projectPath = path.resolve("/tmp/codeline-project-folder-status-project")
  const finishedAt = new Date("2026-08-29T12:00:00.000Z")

  try {
    await fixture.database.insert(applicationUserTable).values([
      { id: userId, displayName: "Project Folder Status User" },
      { id: otherUserId, displayName: "Project Folder Status Other User" },
    ])
    await fixture.database.insert(organizationTable).values([
      { id: organizationId, externalId: organizationId, name: "Project Folder Status Organization" },
      { id: otherOrganizationId, externalId: otherOrganizationId, name: "Project Folder Status Other Organization" },
    ])
    await fixture.database.insert(serverTable).values([
      { endpoint: "https://project-folder-status.test", id: serverId, name: "Current", organizationId },
      { endpoint: "https://project-folder-status-other.test", id: otherServerId, name: "Other", organizationId },
      {
        endpoint: "https://project-folder-status-other-organization.test",
        id: otherOrganizationServerId,
        name: "Other Organization",
        organizationId: otherOrganizationId,
      },
    ])
    await fixture.database.insert(agentTable).values([
      { id: agentId, name: "Current Agent", role: "coding", serverId },
      {
        id: otherOrganizationAgentId,
        name: "Other Organization Agent",
        role: "coding",
        serverId: otherOrganizationServerId,
      },
    ])
    const folder = await projectFolderRepositoryCreate(fixture.database, userId, { name: "Workspace" })
    const project = await projectRegistryRepositoryUpsert(fixture.database, userId, { path: projectPath })
    expect(folder.success).toBe(true)
    expect(project.success).toBe(true)
    if (!folder.success || !project.success) return
    await projectRegistryRepositoryMove(fixture.database, userId, project.data.id, { folderId: folder.data.id })

    await fixture.database.insert(sessionTable).values([
      {
        id: "project-folder-status-active",
        userId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Active",
        clientRequestId: "project-folder-status-active-request",
      },
      {
        id: "project-folder-status-unseen-ended",
        userId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Unseen ended",
        clientRequestId: "project-folder-status-unseen-ended-request",
      },
      {
        archivedAt: new Date("2026-08-29T13:00:00.000Z"),
        id: "project-folder-status-archived",
        userId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Archived",
        clientRequestId: "project-folder-status-archived-request",
      },
      {
        id: "project-folder-status-other-organization",
        userId,
        serverId: otherOrganizationServerId,
        primaryAgentId: otherOrganizationAgentId,
        projectPath,
        title: "Other organization",
        clientRequestId: "project-folder-status-other-organization-request",
      },
      {
        id: "project-folder-status-other-user",
        userId: otherUserId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Other user",
        clientRequestId: "project-folder-status-other-user-request",
      },
    ])
    const runs: Array<typeof runTable.$inferInsert> = [
      {
        id: "project-folder-status-active-run",
        userId,
        sessionId: "project-folder-status-active",
        clientRunId: "project-folder-status-active-client-run",
        streamId: "project-folder-status-active-stream",
        snapshot: runSnapshotCreate(agentId, serverId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        status: "running",
      },
      {
        id: "project-folder-status-unseen-ended-run",
        userId,
        sessionId: "project-folder-status-unseen-ended",
        clientRunId: "project-folder-status-unseen-ended-client-run",
        streamId: "project-folder-status-unseen-ended-stream",
        snapshot: runSnapshotCreate(agentId, serverId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        finishedAt,
        status: "succeeded",
      },
      {
        id: "project-folder-status-archived-run",
        userId,
        sessionId: "project-folder-status-archived",
        clientRunId: "project-folder-status-archived-client-run",
        streamId: "project-folder-status-archived-stream",
        snapshot: runSnapshotCreate(agentId, serverId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        status: "running",
      },
      {
        id: "project-folder-status-other-organization-run",
        userId,
        sessionId: "project-folder-status-other-organization",
        clientRunId: "project-folder-status-other-organization-client-run",
        streamId: "project-folder-status-other-organization-stream",
        snapshot: runSnapshotCreate(otherOrganizationAgentId, otherOrganizationServerId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        status: "running",
      },
    ]
    await fixture.database.insert(runTable).values(runs)
    await fixture.database.insert(sessionViewTable).values({
      userId,
      sessionId: "project-folder-status-unseen-ended",
      acknowledgedFinishedAt: new Date("2026-08-29T12:00:00.000Z"),
    })

    const current = await projectFolderStatusList(fixture.database, userId, organizationId)
    expect(current).toMatchObject({
      success: true,
      data: [{ active: true, folderId: folder.data.id, projectId: project.data.id, unseenEnded: false }],
    })

    await fixture.database
      .update(sessionViewTable)
      .set({ acknowledgedFinishedAt: new Date("2026-08-29T11:00:00.000Z") })
    const unseen = await projectFolderStatusList(fixture.database, userId, organizationId)
    expect(unseen).toMatchObject({
      success: true,
      data: [{ active: true, folderId: folder.data.id, projectId: project.data.id, unseenEnded: true }],
    })
    const emptyOrganization = await projectFolderStatusList(
      fixture.database,
      userId,
      "project-folder-status-empty-organization",
    )
    expect(emptyOrganization).toMatchObject({
      success: true,
      data: [{ active: false, folderId: folder.data.id, projectId: project.data.id, unseenEnded: false }],
    })
  } finally {
    await fixture.dispose()
  }
})
