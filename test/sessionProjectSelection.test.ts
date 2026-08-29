import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { projectRegistryRepositoryDelete } from "../src/project/db/projectRegistryRepositoryDelete.js"
import { projectRegistryRepositoryUpsert } from "../src/project/db/projectRegistryRepositoryUpsert.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../src/session/actions/sessionDelete.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { sessionExecutionSelectionDefaultRepositoryUpsert } from "../src/session/db/sessionExecutionSelectionDefaultRepositoryUpsert.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-session-project-selection-"))
const databasePath = path.join(rootDirectory, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const userId = `session-project-user-${uuidv7()}`
const otherUserId = `session-project-other-user-${uuidv7()}`
const organizationId = `session-project-organization-${uuidv7()}`
const serverId = `session-project-server-${uuidv7()}`
const agentId = `session-project-agent-${uuidv7()}`
let activeUserId = userId

const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `session-project-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)

const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("requestIdentity", { organizationId, userId: activeUserId })
  await next()
})
apiSessionRoutesAdd(app, {
  database,
  journalCursorCodec: journalCursorCodec.data,
  journalPostCommitPublish: async () => createResult(undefined),
  projectRootDirs: [rootDirectory],
})

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Session Project User", id: userId },
    { displayName: "Session Project Other User", id: otherUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: organizationId,
    id: organizationId,
    name: "Session Project Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-project.test",
    id: serverId,
    name: "Session Project Server",
    organizationId,
  })
  await database.insert(agentTable).values({
    id: agentId,
    name: "Session Project Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootDirectory, { force: true, recursive: true })
})

test("the session API rejects creation without a registered project ID", async () => {
  const arbitraryProjectRoot = path.join(rootDirectory, "unregistered-api-project")
  await mkdir(arbitraryProjectRoot)

  const omittedProjectId = await app.request("/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-project-omitted-id-${uuidv7()}`,
      primaryAgentId: agentId,
      projectPath: arbitraryProjectRoot,
      serverId,
      title: "Omitted project ID",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(omittedProjectId.status).toBe(400)

  const arbitraryProjectPath = await app.request("/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-project-arbitrary-path-${uuidv7()}`,
      primaryAgentId: agentId,
      projectPath: path.join(rootDirectory, "another-unregistered-api-project"),
      serverId,
      title: "Arbitrary project path",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(arbitraryProjectPath.status).toBe(400)

  await rm(arbitraryProjectRoot, { force: true, recursive: true })
})

test("the session API resolves an owned registered project and preserves its path snapshot", async () => {
  const projectRoot = path.join(rootDirectory, "api-project")
  await mkdir(projectRoot)
  const registered = await projectRegistryRepositoryUpsert(database, userId, { path: projectRoot })
  expect(registered.success).toBe(true)
  if (!registered.success) return

  const response = await app.request("/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-project-api-${uuidv7()}`,
      primaryAgentId: agentId,
      projectId: registered.data.id,
      projectPath: path.join(rootDirectory, "caller-supplied-path"),
      serverId,
      title: "API registered project",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  const responseBody = await response.json()
  expect({ body: responseBody, status: response.status }).toMatchObject({ status: 201 })
  const body = responseBody as { session: { id: string; projectId?: string; projectPath: string } }
  expect(body.session).toMatchObject({
    projectId: registered.data.id,
    projectPath: projectRoot,
  })

  const listed = await app.request("/sessions")
  expect(await listed.json()).toMatchObject({ sessions: [{ id: body.session.id, projectId: registered.data.id }] })

  activeUserId = otherUserId
  const crossUser = await app.request("/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-project-cross-user-${uuidv7()}`,
      primaryAgentId: agentId,
      projectId: registered.data.id,
      serverId,
      title: "Cross-user project",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(crossUser.status).toBe(404)

  activeUserId = userId
  await rm(projectRoot, { force: true, recursive: true })
  const loaded = await app.request(`/sessions/${body.session.id}`)
  expect(loaded.status).toBe(200)
  expect(await loaded.json()).toMatchObject({
    session: { id: body.session.id, projectId: registered.data.id, projectPath: projectRoot },
  })

  const unavailable = await app.request("/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-project-unavailable-${uuidv7()}`,
      primaryAgentId: agentId,
      projectId: registered.data.id,
      serverId,
      title: "Unavailable project",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(unavailable.status).toBe(404)
})

test("session responses expose only resolvable registry IDs for historical path snapshots", async () => {
  activeUserId = userId
  const registeredPath = path.join(rootDirectory, "historical-registered")
  const unregisteredPath = path.join(rootDirectory, "historical-unregistered")
  await mkdir(registeredPath)
  await mkdir(unregisteredPath)
  const registered = await projectRegistryRepositoryUpsert(database, userId, { path: registeredPath })
  const foreign = await projectRegistryRepositoryUpsert(database, otherUserId, { path: unregisteredPath })
  expect(registered.success).toBe(true)
  expect(foreign.success).toBe(true)
  if (!registered.success || !foreign.success) return

  const sessions = [
    { id: uuidv7(), projectPath: registeredPath, title: "Registered canonical" },
    { id: uuidv7(), projectPath: unregisteredPath, title: "Unregistered historical" },
    { id: uuidv7(), projectPath: `${registeredPath}/.`, title: "Noncanonical historical" },
  ]
  await database.insert(sessionTable).values(
    sessions.map((session) => ({
      clientRequestId: `historical-response-${session.id}`,
      id: session.id,
      primaryAgentId: agentId,
      projectPath: session.projectPath,
      serverId,
      title: session.title,
      userId,
    })),
  )

  try {
    const listed = await app.request("/sessions")
    const listedBody = (await listed.json()) as {
      sessions: Array<{ id: string; projectId?: string; projectPath: string }>
    }
    for (const session of sessions)
      expect(listedBody.sessions.find(({ id }) => id === session.id)).toMatchObject({
        id: session.id,
        ...(session.projectPath === registeredPath ? { projectId: registered.data.id } : {}),
        projectPath: session.projectPath,
      })
    expect(listedBody.sessions.find(({ id }) => id === sessions[1]?.id)?.projectId).toBeUndefined()
    expect(listedBody.sessions.find(({ id }) => id === sessions[2]?.id)?.projectId).toBeUndefined()

    for (const session of sessions) {
      const detail = await app.request(`/sessions/${session.id}`)
      expect(await detail.json()).toMatchObject({
        session: {
          id: session.id,
          ...(session.projectPath === registeredPath ? { projectId: registered.data.id } : {}),
          projectPath: session.projectPath,
        },
      })

      const snapshot = await app.request(`/sessions/${session.id}/snapshot`)
      expect(await snapshot.json()).toMatchObject({
        session: {
          id: session.id,
          ...(session.projectPath === registeredPath ? { projectId: registered.data.id } : {}),
          projectPath: session.projectPath,
        },
      })
    }
  } finally {
    for (const session of sessions) await database.delete(sessionTable).where(eq(sessionTable.id, session.id))
    await projectRegistryRepositoryDelete(database, userId, registered.data.id)
    await projectRegistryRepositoryDelete(database, otherUserId, foreign.data.id)
  }
})

test("the session action resolves a registered project before loading project-scoped defaults", async () => {
  const projectRoot = path.join(rootDirectory, "action-project")
  await mkdir(projectRoot)
  const registered = await projectRegistryRepositoryUpsert(database, userId, { path: projectRoot })
  expect(registered.success).toBe(true)
  if (!registered.success) return

  const defaultSelection = {
    tools: {
      primary: { agentId, tools: { bash: false, webfetch: true } },
      selectableSubagents: [],
    },
    version: 1 as const,
  }
  const savedDefault = await sessionExecutionSelectionDefaultRepositoryUpsert(database, userId, {
    executionSelection: defaultSelection,
    projectPath: projectRoot,
  })
  expect(savedDefault.success).toBe(true)
  if (!savedDefault.success) return

  const input = {
    clientRequestId: `session-project-action-${uuidv7()}`,
    metadata: {},
    primaryAgentId: agentId,
    projectId: registered.data.id,
    serverId,
    title: "Action registered project",
  }
  const created = await sessionCreate(database, userId, input, {
    organizationId,
    projectRootDirs: [rootDirectory],
  })
  expect(created).toMatchObject({
    success: true,
    data: { session: { executionSelection: defaultSelection, projectPath: projectRoot } },
  })
  if (!created.success) return

  expect(
    await sessionCreate(
      database,
      otherUserId,
      { ...input, clientRequestId: uuidv7() },
      {
        organizationId,
        projectRootDirs: [rootDirectory],
      },
    ),
  ).toMatchObject({ success: false, errorMessage: "The project could not be found." })
  await rm(projectRoot, { force: true, recursive: true })
  expect(
    await sessionCreate(
      database,
      userId,
      { ...input, clientRequestId: uuidv7() },
      {
        organizationId,
        projectRootDirs: [rootDirectory],
      },
    ),
  ).toMatchObject({ success: false, errorMessage: "The project could not be found." })

  const loaded = await sessionLoad(database, userId, organizationId, created.data.session.id)
  expect(loaded).toMatchObject({ success: true, data: { session: { projectPath: projectRoot } } })
  await sessionDelete(database, userId, created.data.session.id)
})
