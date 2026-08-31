import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { runTable } from "../src/run/db/runTable.js"
import type { RunExecutionSnapshot } from "../src/run/schema/runExecutionSnapshotSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const runSnapshotCreate = (agentId: string, serverId: string): RunExecutionSnapshot => ({
  configuration: {
    model: "project-registry-test-model",
    provider: "deterministic",
    tools: { bash: false, webfetch: false },
  },
  configurationRevision: "project-registry-test-revision",
  target: { agentId, serverId },
})

describe("project registry HTTP routes", () => {
  let rootDirectory: string
  let projectRoot: string
  let outsideRoot: string
  let databasePath: string
  let app: Hono<AppEnvironment>
  let database: ReturnType<typeof databaseConnectionCreate>["db"]
  let disposeDatabase: () => Promise<void>
  let activeUserId = "project-registry-api-user-one"
  let activeOrganizationId: string | undefined
  const firstUserId = "project-registry-api-user-one"
  const secondUserId = "project-registry-api-user-two"

  beforeAll(async () => {
    rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-api-roots-"))
    projectRoot = path.join(rootDirectory, "project")
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-api-outside-"))
    databasePath = path.join(rootDirectory, "db.sqlite")
    await fs.mkdir(projectRoot)
    await fs.writeFile(path.join(projectRoot, "README.md"), "registry project\n", "utf8")

    const migrated = await databaseMigrate(databasePath)
    if (!migrated.success) throw new Error(migrated.errorMessage)
    const connection = databaseConnectionCreate(databasePath)
    database = connection.db
    disposeDatabase = async () => {
      await databaseConnectionClose(connection)
    }
    app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      if (activeUserId.length > 0) {
        context.set("requestIdentity", {
          organizationId: activeOrganizationId,
          userId: activeUserId,
        })
      }
      await next()
    })
    apiProjectRoutesAdd(app, { database: connection.db, rootDirs: [rootDirectory] })

    await connection.db.insert(applicationUserTable).values([
      { displayName: "Registry API User One", id: firstUserId },
      { displayName: "Registry API User Two", id: secondUserId },
    ])

    await fs.writeFile(path.join(outsideRoot, "outside.txt"), "outside\n", "utf8")
  })

  afterAll(async () => {
    await Promise.all([
      fs.rm(rootDirectory, { force: true, recursive: true }),
      fs.rm(outsideRoot, { force: true, recursive: true }),
      disposeDatabase(),
    ])
  })

  test("requires authentication and isolates registry CRUD by user", async () => {
    activeUserId = ""
    const unauthorized = await app.request("http://codeline.test/project/registry")
    expect(unauthorized.status).toBe(401)

    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: `${projectRoot}/.` }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)

    const canonical = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(canonical.status).toBe(200)
    const firstBody = (await canonical.json()) as { project: { available: boolean; id: string; label: string } }
    expect(firstBody.project).toMatchObject({ available: true, label: "Registered Project" })
    expect(firstBody.project).toMatchObject({ parentFolder: null })
    expect(firstBody.project).toMatchObject({ folderId: null })
    expect(firstBody.project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    const firstList = await app.request("http://codeline.test/project/list")
    const firstListBody = (await firstList.json()) as {
      folders: Array<{ id: string; label: string }>
      projects: Array<{ folderId: string | null; id: string; parentFolder: unknown }>
      truncated: boolean
    }
    expect(firstListBody).toMatchObject({ truncated: false })
    expect(firstListBody.folders).toHaveLength(1)
    expect(firstListBody.projects).toHaveLength(1)
    expect(firstListBody.projects[0]).toMatchObject({
      folderId: firstListBody.folders[0]?.id,
      id: firstBody.project.id,
      parentFolder: { id: firstListBody.folders[0]?.id, label: firstListBody.folders[0]?.label },
    })

    activeUserId = secondUserId
    const secondList = await app.request("http://codeline.test/project/registry")
    const secondListBody = (await secondList.json()) as {
      projects: Array<{ id: string }>
    }
    expect(secondListBody.projects).toHaveLength(1)
    expect(secondListBody.projects[0]?.id).not.toBe(firstBody.project.id)
    const hidden = await app.request(`http://codeline.test/project/registry/${firstBody.project.id}`)
    expect(hidden.status).toBe(404)
    expect(JSON.stringify(await hidden.json())).not.toContain(projectRoot)
    const hiddenFilesystem = await app.request(
      `http://codeline.test/project/text?project=${firstBody.project.id}&path=README.md`,
    )
    expect(hiddenFilesystem.status).toBe(404)

    const secondRegistration = await app.request("http://codeline.test/project/register", {
      body: JSON.stringify({ path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(secondRegistration.status).toBe(200)
    const secondBody = (await secondRegistration.json()) as { project: { id: string } }
    expect(secondBody.project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(secondBody.project.id).not.toBe(firstBody.project.id)

    const firstProjectRename = await app.request(`http://codeline.test/project/registry/${firstBody.project.id}`, {
      body: JSON.stringify({ displayName: "Should not be visible" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(firstProjectRename.status).toBe(404)
    const firstProjectRemove = await app.request(`http://codeline.test/project/remove/${firstBody.project.id}`, {
      method: "DELETE",
    })
    expect(firstProjectRemove.status).toBe(404)
  })

  test("renames and removes a project without touching its files", async () => {
    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id

    const renamed = await app.request(`http://codeline.test/project/rename/${projectId}`, {
      body: JSON.stringify({ displayName: "Renamed Project" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({
      project: { id: projectId, label: "Renamed Project", available: true },
    })

    const removed = await app.request(`http://codeline.test/project/registry/${projectId}`, { method: "DELETE" })
    expect(removed.status).toBe(204)
    expect(await fs.readFile(path.join(projectRoot, "README.md"), "utf8")).toBe("registry project\n")
    expect((await (await app.request("http://codeline.test/project/registry")).json()).projects).toEqual([])
  })

  test("keeps unavailable registrations visible while rejecting unsafe registration and use", async () => {
    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id

    expect(
      (
        await app.request("http://codeline.test/project/registry", {
          body: JSON.stringify({ path: outsideRoot }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(400)
    const symlinkPath = path.join(rootDirectory, "linked-project")
    await fs.symlink(outsideRoot, symlinkPath)
    expect(
      (
        await app.request("http://codeline.test/project/registry", {
          body: JSON.stringify({ path: symlinkPath }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(400)

    await fs.rm(projectRoot, { force: true, recursive: true })
    const listed = await app.request("http://codeline.test/project/registry")
    const listedBody = (await listed.json()) as {
      projects: Array<Record<string, unknown>>
      truncated: boolean
    }
    expect(listedBody).toMatchObject({
      projects: [
        {
          active: false,
          available: false,
          folderId: null,
          id: projectId,
          faviconUrl: null,
          label: "Registered Project",
          parentFolder: null,
          unseenEnded: false,
        },
      ],
      truncated: false,
    })
    const resolved = await app.request(`http://codeline.test/project/resolve?project=${projectId}`)
    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toEqual({
      project: {
        active: false,
        available: false,
        folderId: null,
        id: projectId,
        faviconUrl: null,
        label: "Registered Project",
        parentFolder: null,
        unseenEnded: false,
      },
    })
    const filesystem = await app.request(`http://codeline.test/project/text?project=${projectId}&path=README.md`)
    expect(filesystem.status).toBe(404)
  })

  test("returns the selected project folder as a nested parent folder", async () => {
    activeUserId = firstUserId
    const folder = await app.request("http://codeline.test/project/registry/folders", {
      body: JSON.stringify({ name: "Workspace" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(folder.status).toBe(200)
    const folderBody = (await folder.json()) as { folder: { id: string; label: string } }

    const folderProjectRoot = path.join(rootDirectory, "folder-project")
    await fs.mkdir(folderProjectRoot)
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ path: folderProjectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id

    const moved = await app.request(`http://codeline.test/project/registry/move/${projectId}`, {
      body: JSON.stringify({ folderId: folderBody.folder.id }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(moved.status).toBe(200)
    const movedBody = (await moved.json()) as { project: Record<string, unknown> }
    expect(movedBody.project).toMatchObject({
      parentFolder: { id: folderBody.folder.id, label: "Workspace" },
    })
    expect(movedBody.project).toMatchObject({ folderId: folderBody.folder.id })
  })

  test("supports folder CRUD, rejects duplicate names, moves and unassigns projects, and preserves projects on delete", async () => {
    activeUserId = firstUserId
    const folder = await app.request("http://codeline.test/project/registry/folders", {
      body: JSON.stringify({ name: "API Folder" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(folder.status).toBe(200)
    const folderBody = (await folder.json()) as { folder: { id: string; label: string } }

    const conflictingFolder = await app.request("http://codeline.test/project/registry/folders", {
      body: JSON.stringify({ name: "API Folder Conflict" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(conflictingFolder.status).toBe(200)
    const conflictingFolderBody = (await conflictingFolder.json()) as { folder: { id: string } }

    const duplicate = await app.request("http://codeline.test/project/registry/folders", {
      body: JSON.stringify({ name: " API Folder " }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({ error: { code: "conflict" } })

    const duplicateRename = await app.request(`http://codeline.test/project/registry/folders/${folderBody.folder.id}`, {
      body: JSON.stringify({ name: "API Folder Conflict" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(duplicateRename.status).toBe(409)

    const removedConflict = await app.request(
      `http://codeline.test/project/registry/folders/${conflictingFolderBody.folder.id}`,
      { method: "DELETE" },
    )
    expect(removedConflict.status).toBe(204)

    activeUserId = secondUserId
    const hiddenRename = await app.request(`http://codeline.test/project/registry/folders/${folderBody.folder.id}`, {
      body: JSON.stringify({ name: "Hidden Rename" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(hiddenRename.status).toBe(404)
    const hiddenDelete = await app.request(`http://codeline.test/project/registry/folders/${folderBody.folder.id}`, {
      method: "DELETE",
    })
    expect(hiddenDelete.status).toBe(404)
    activeUserId = firstUserId

    const renamed = await app.request(`http://codeline.test/project/registry/folders/${folderBody.folder.id}`, {
      body: JSON.stringify({ name: "API Folder Renamed" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ folder: { id: folderBody.folder.id, label: "API Folder Renamed" } })

    const folderProjectRoot = path.join(rootDirectory, "folder-crud-project")
    await fs.mkdir(folderProjectRoot)
    await fs.writeFile(path.join(folderProjectRoot, "README.md"), "folder CRUD project\n", "utf8")
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ path: folderProjectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)
    const projectId = ((await registered.json()) as { project: { id: string; folderId: string | null } }).project.id

    const moved = await app.request(`http://codeline.test/project/registry/move/${projectId}`, {
      body: JSON.stringify({ folderId: folderBody.folder.id }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(moved.status).toBe(200)
    expect(await moved.json()).toMatchObject({
      project: {
        folderId: folderBody.folder.id,
        parentFolder: { id: folderBody.folder.id, label: "API Folder Renamed" },
      },
    })

    const unassigned = await app.request(`http://codeline.test/project/registry/${projectId}/folder`, {
      body: JSON.stringify({ folderId: null }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(unassigned.status).toBe(200)
    expect(await unassigned.json()).toMatchObject({ project: { folderId: null, parentFolder: null } })

    const reassigned = await app.request(`http://codeline.test/project/registry/${projectId}/folder`, {
      body: JSON.stringify({ folderId: folderBody.folder.id }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(reassigned.status).toBe(200)

    const removed = await app.request(`http://codeline.test/project/registry/folders/${folderBody.folder.id}`, {
      method: "DELETE",
    })
    expect(removed.status).toBe(204)
    const listed = await app.request("http://codeline.test/project/registry")
    const listedBody = (await listed.json()) as {
      folders: Array<{ id: string }>
      projects: Array<{ folderId: string | null; id: string; parentFolder: unknown }>
    }
    expect(listedBody.folders.some((candidate) => candidate.id === folderBody.folder.id)).toBe(false)
    expect(listedBody.projects.find((candidate) => candidate.id === projectId)).toMatchObject({
      folderId: null,
      parentFolder: null,
    })
    expect(await fs.readFile(path.join(folderProjectRoot, "README.md"), "utf8")).toBe("folder CRUD project\n")
  })

  test("reports active and unseen-ended status only from current organization sessions", async () => {
    activeUserId = firstUserId
    const organizationId = "project-registry-api-status-organization"
    const otherOrganizationId = "project-registry-api-status-other-organization"
    const serverId = "project-registry-api-status-server"
    const otherServerId = "project-registry-api-status-other-server"
    const agentId = "project-registry-api-status-agent"
    const otherAgentId = "project-registry-api-status-other-agent"
    const projectPath = path.join(rootDirectory, "status-project")
    const finishedAt = new Date("2026-08-29T12:00:00.000Z")

    await fs.mkdir(projectPath)
    await fs.writeFile(path.join(projectPath, "README.md"), "status project\n", "utf8")
    await database.insert(organizationTable).values([
      { id: organizationId, externalId: organizationId, name: "Registry API Status Organization" },
      { id: otherOrganizationId, externalId: otherOrganizationId, name: "Registry API Other Organization" },
    ])
    await database.insert(serverTable).values([
      { endpoint: "https://project-registry-api-status.test", id: serverId, name: "Status", organizationId },
      {
        endpoint: "https://project-registry-api-status-other.test",
        id: otherServerId,
        name: "Other Status",
        organizationId: otherOrganizationId,
      },
    ])
    await database.insert(agentTable).values([
      { id: agentId, name: "Status Agent", role: "coding", serverId },
      { id: otherAgentId, name: "Other Status Agent", role: "coding", serverId: otherServerId },
    ])
    activeOrganizationId = organizationId

    const folder = await app.request("http://codeline.test/project/registry/folders", {
      body: JSON.stringify({ name: "Status Folder" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(folder.status).toBe(200)
    const folderId = ((await folder.json()) as { folder: { id: string } }).folder.id
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ path: projectPath }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id
    const moved = await app.request(`http://codeline.test/project/registry/move/${projectId}`, {
      body: JSON.stringify({ folderId }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(moved.status).toBe(200)

    await database.insert(sessionTable).values([
      {
        id: "project-registry-api-status-ended",
        userId: firstUserId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Status ended",
        clientRequestId: "project-registry-api-status-ended-request",
      },
      {
        id: "project-registry-api-status-archived",
        userId: firstUserId,
        serverId,
        primaryAgentId: agentId,
        projectPath,
        title: "Status archived",
        clientRequestId: "project-registry-api-status-archived-request",
        archivedAt: new Date("2026-08-29T13:00:00.000Z"),
      },
      {
        id: "project-registry-api-status-other-organization",
        userId: firstUserId,
        serverId: otherServerId,
        primaryAgentId: otherAgentId,
        projectPath,
        title: "Status other organization",
        clientRequestId: "project-registry-api-status-other-organization-request",
      },
    ])
    const runs: Array<typeof runTable.$inferInsert> = [
      {
        id: "project-registry-api-status-ended-run",
        userId: firstUserId,
        sessionId: "project-registry-api-status-ended",
        clientRunId: "project-registry-api-status-ended-client-run",
        streamId: "project-registry-api-status-ended-stream",
        snapshot: runSnapshotCreate(agentId, serverId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        finishedAt,
        status: "succeeded",
      },
      {
        id: "project-registry-api-status-archived-run",
        userId: firstUserId,
        sessionId: "project-registry-api-status-archived",
        clientRunId: "project-registry-api-status-archived-client-run",
        streamId: "project-registry-api-status-archived-stream",
        snapshot: runSnapshotCreate(agentId, serverId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        status: "running",
      },
      {
        id: "project-registry-api-status-other-organization-run",
        userId: firstUserId,
        sessionId: "project-registry-api-status-other-organization",
        clientRunId: "project-registry-api-status-other-organization-client-run",
        streamId: "project-registry-api-status-other-organization-stream",
        snapshot: runSnapshotCreate(otherAgentId, otherServerId),
        budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
        deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
        status: "running",
      },
    ]
    await database.insert(runTable).values(runs)

    const listed = await app.request("http://codeline.test/project/registry")
    expect(listed.status).toBe(200)
    const listedBody = (await listed.json()) as {
      folders: Array<{ active: boolean; id: string; unseenEnded: boolean }>
      projects: Array<{ active: boolean; folderId: string | null; id: string; unseenEnded: boolean }>
    }
    expect(listedBody.projects.find((project) => project.id === projectId)).toMatchObject({
      active: false,
      folderId,
      unseenEnded: true,
    })
    expect(listedBody.folders.find((folder) => folder.id === folderId)).toMatchObject({
      active: false,
      unseenEnded: true,
    })
    activeOrganizationId = undefined
  })

  test("includes a revisioned favicon URL in registry list and detail responses", async () => {
    activeUserId = firstUserId
    const faviconProjectRoot = path.join(rootDirectory, "favicon-project")
    await fs.mkdir(path.join(faviconProjectRoot, "public"), { recursive: true })
    await fs.writeFile(path.join(faviconProjectRoot, "public", "favicon.ico"), Buffer.from([0, 1, 2, 3]))

    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ path: faviconProjectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)
    const registeredBody = (await registered.json()) as { project: { faviconUrl: string | null; id: string } }
    const projectId = registeredBody.project.id
    expect(registeredBody.project.faviconUrl).not.toBeNull()

    const faviconUrl = new URL(registeredBody.project.faviconUrl as string, "http://codeline.test")
    expect(faviconUrl.pathname).toBe(`/api/project/favicon/${projectId}`)
    expect(faviconUrl.searchParams.get("revision")).toBeString()

    const listed = await app.request("http://codeline.test/project/registry")
    expect(listed.status).toBe(200)
    const listedBody = (await listed.json()) as {
      projects: Array<{ faviconUrl: string | null; id: string }>
    }
    expect(listedBody.projects.find((project) => project.id === projectId)?.faviconUrl).toBe(
      registeredBody.project.faviconUrl,
    )

    const detail = await app.request(`http://codeline.test/project/registry/${projectId}`)
    expect(detail.status).toBe(200)
    const detailBody = (await detail.json()) as { project: { faviconUrl: string | null; id: string } }
    expect(detailBody.project).toMatchObject(registeredBody.project)
  })
})
