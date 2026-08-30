import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { projectConfiguredRootsReconcile } from "../src/project/db/projectConfiguredRootsReconcile.js"
import { projectRegistryRepositoryList } from "../src/project/db/projectRegistryRepositoryList.js"
import { projectResolve } from "../src/project/projectResolve.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../src/session/actions/sessionDelete.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

test("reconciled project symlinks use live authorization while ordinary projects remain canonical", async () => {
  const homePath = await fs.realpath(os.homedir())
  const filesystemRoot = await fs.mkdtemp(path.join(homePath, ".codeline-project-registry-symlink-"))
  const databaseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-symlink-database-"))
  const configuredRoot = path.join(filesystemRoot, "leo")
  const targetsRoot = path.join(filesystemRoot, "targets")
  const canonicalPath = path.join(targetsRoot, "contentoren")
  const replacementPath = path.join(targetsRoot, "replacement")
  const ordinaryPath = path.join(configuredRoot, "ordinary")
  const authorizationPath = path.join(configuredRoot, "contentoren")
  const outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-symlink-outside-"))
  const outsideAuthorizationPath = path.join(configuredRoot, "outside")
  const databasePath = path.join(databaseDirectory, "db.sqlite")
  const userId = `project-registry-symlink-user-${uuidv7()}`
  const organizationId = `project-registry-symlink-organization-${uuidv7()}`
  const serverId = `project-registry-symlink-server-${uuidv7()}`
  const agentId = `project-registry-symlink-agent-${uuidv7()}`
  const migrated = await databaseMigrate(databasePath)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const connection = databaseConnectionCreate(databasePath)
  const database = connection.db
  const sessions: string[] = []

  try {
    await fs.mkdir(canonicalPath, { recursive: true })
    await fs.mkdir(replacementPath)
    await fs.mkdir(ordinaryPath, { recursive: true })
    await fs.symlink(canonicalPath, authorizationPath)
    await fs.symlink(outsidePath, outsideAuthorizationPath)
    await database.insert(applicationUserTable).values({ displayName: "Project Registry Symlink User", id: userId })
    await database.insert(organizationTable).values({
      externalId: organizationId,
      id: organizationId,
      name: "Project Registry Symlink Organization",
    })
    await database.insert(serverTable).values({
      endpoint: "https://project-registry-symlink.test",
      id: serverId,
      name: "Project Registry Symlink Server",
      organizationId,
    })
    await database.insert(agentTable).values({
      id: agentId,
      name: "Project Registry Symlink Agent",
      role: "coding",
      serverId,
    })

    const reconciled = await projectConfiguredRootsReconcile(database, userId, [configuredRoot])
    expect(reconciled.success).toBe(true)
    if (!reconciled.success) return
    const linkedProject = reconciled.data.find((project) => project.path === canonicalPath)
    const ordinaryProject = reconciled.data.find((project) => project.path === ordinaryPath)
    expect(reconciled.data.some((project) => project.path === outsidePath)).toBe(false)
    expect(linkedProject).toMatchObject({ authorizationPath, path: canonicalPath })
    expect(ordinaryProject).toMatchObject({ authorizationPath: null, path: ordinaryPath })
    if (linkedProject === undefined || ordinaryProject === undefined) return
    const repeated = await projectConfiguredRootsReconcile(database, userId, [configuredRoot])
    expect(repeated.success).toBe(true)
    if (!repeated.success) return
    expect(repeated.data.find((project) => project.path === canonicalPath)).toMatchObject({
      authorizationPath,
      id: linkedProject.id,
      path: canonicalPath,
    })

    const linkedResolved = await projectResolve([configuredRoot], linkedProject.id, { database, userId })
    expect(linkedResolved).toEqual({ success: true, data: { id: linkedProject.id, rootDir: canonicalPath } })
    expect(await projectResolve([configuredRoot], ordinaryProject.id, { database, userId })).toMatchObject({
      success: true,
      data: { id: ordinaryProject.id, rootDir: ordinaryPath },
    })

    const app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      context.set("requestIdentity", { organizationId, userId })
      await next()
    })
    apiProjectRoutesAdd(app, { database, rootDirs: [configuredRoot] })
    const journalCursorCodec = journalCursorCodecCreate({
      randomBytes,
      secret: `project-registry-symlink-journal-${uuidv7()}`,
    })
    if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
    apiSessionRoutesAdd(app, {
      database,
      journalCursorCodec: journalCursorCodec.data,
      journalPostCommitPublish: async () => createResult(undefined),
      projectRootDirs: [configuredRoot],
    })

    const available = await app.request("http://codeline.test/project/registry")
    expect(available.status).toBe(200)
    const availableBody = (await available.json()) as {
      projects: Array<{ available: boolean; id: string }>
    }
    expect(availableBody.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ available: true, id: linkedProject.id }),
        expect.objectContaining({ available: true, id: ordinaryProject.id }),
      ]),
    )
    expect(JSON.stringify(availableBody)).not.toContain(filesystemRoot)

    const createSession = (projectId: string, suffix: string) =>
      sessionCreate(
        database,
        userId,
        {
          clientRequestId: `project-registry-symlink-session-${suffix}-${uuidv7()}`,
          metadata: {},
          primaryAgentId: agentId,
          projectId,
          serverId,
          title: `Project Registry Symlink ${suffix}`,
        },
        { organizationId, projectRootDirs: [configuredRoot] },
      )

    const linkedSession = await createSession(linkedProject.id, "linked")
    expect(linkedSession).toMatchObject({ success: true, data: { session: { projectPath: canonicalPath } } })
    if (!linkedSession.success) return
    sessions.push(linkedSession.data.session.id)
    const ordinarySession = await createSession(ordinaryProject.id, "ordinary")
    expect(ordinarySession).toMatchObject({ success: true, data: { session: { projectPath: ordinaryPath } } })
    if (!ordinarySession.success) return
    sessions.push(ordinarySession.data.session.id)

    const apiSession = await app.request("http://codeline.test/sessions", {
      body: JSON.stringify({
        clientRequestId: `project-registry-symlink-api-session-${uuidv7()}`,
        primaryAgentId: agentId,
        projectId: linkedProject.id,
        serverId,
        title: "Project Registry Symlink API",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(apiSession.status).toBe(201)
    const apiSessionBody = (await apiSession.json()) as {
      session: { id: string; projectId?: string; projectPath: string }
    }
    expect(apiSessionBody.session).toMatchObject({
      projectId: linkedProject.id,
      projectPath: canonicalPath,
    })
    sessions.push(apiSessionBody.session.id)

    await fs.rm(authorizationPath)
    expect((await projectResolve([configuredRoot], linkedProject.id, { database, userId })).success).toBe(false)
    expect(await createSession(linkedProject.id, "removed")).toMatchObject({
      success: false,
      errorMessage: "The project could not be found.",
    })
    const removedApiSession = await app.request("http://codeline.test/sessions", {
      body: JSON.stringify({
        clientRequestId: `project-registry-symlink-api-removed-${uuidv7()}`,
        primaryAgentId: agentId,
        projectId: linkedProject.id,
        serverId,
        title: "Project Registry Symlink API Removed",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(removedApiSession.status).toBe(404)
    const removedAvailability = await app.request("http://codeline.test/project/registry")
    const removedBody = (await removedAvailability.json()) as {
      projects: Array<{ available: boolean; id: string }>
    }
    expect(removedBody.projects.find((project) => project.id === linkedProject.id)?.available).toBe(false)

    await fs.symlink(replacementPath, authorizationPath)
    const retargeted = await projectConfiguredRootsReconcile(database, userId, [configuredRoot])
    expect(retargeted.success).toBe(true)
    const storedProjects = await projectRegistryRepositoryList(database, userId)
    expect(storedProjects.success).toBe(true)
    if (!retargeted.success || !storedProjects.success) return
    const replacementProject = retargeted.data.find((project) => project.path === replacementPath)
    const retainedProject = storedProjects.data.find((project) => project.id === linkedProject.id)
    expect(retainedProject).toMatchObject({ authorizationPath, id: linkedProject.id, path: canonicalPath })
    expect(replacementProject).toMatchObject({ authorizationPath, path: replacementPath })
    if (replacementProject === undefined) return
    expect(replacementProject.id).not.toBe(linkedProject.id)
    expect((await projectResolve([configuredRoot], linkedProject.id, { database, userId })).success).toBe(false)
    expect(await createSession(linkedProject.id, "retargeted")).toMatchObject({
      success: false,
      errorMessage: "The project could not be found.",
    })

    const retargetedAvailability = await app.request("http://codeline.test/project/registry")
    const retargetedBody = (await retargetedAvailability.json()) as {
      projects: Array<{ available: boolean; id: string }>
    }
    expect(retargetedBody.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ available: false, id: linkedProject.id }),
        expect.objectContaining({ available: true, id: replacementProject.id }),
      ]),
    )
    expect(JSON.stringify(retargetedBody)).not.toContain(filesystemRoot)

    const cleared = await projectConfiguredRootsReconcile(database, userId, [configuredRoot, targetsRoot])
    expect(cleared.success).toBe(true)
    const clearedProjects = await projectRegistryRepositoryList(database, userId)
    expect(clearedProjects.success).toBe(true)
    if (!cleared.success || !clearedProjects.success) return
    expect(clearedProjects.data.find((project) => project.id === linkedProject.id)).toMatchObject({
      authorizationPath: null,
      id: linkedProject.id,
      path: canonicalPath,
    })
    expect(clearedProjects.data.find((project) => project.id === replacementProject.id)).toMatchObject({
      authorizationPath: null,
      id: replacementProject.id,
      path: replacementPath,
    })
  } finally {
    for (const sessionId of sessions) await sessionDelete(database, userId, sessionId)
    await databaseConnectionClose(connection)
    await fs.rm(databaseDirectory, { force: true, recursive: true })
    await fs.rm(filesystemRoot, { force: true, recursive: true })
    await fs.rm(outsidePath, { force: true, recursive: true })
  }
})
