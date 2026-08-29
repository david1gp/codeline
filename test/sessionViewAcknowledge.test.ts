import { afterAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { projectFolderStatusList } from "../src/project/db/projectFolderStatusList.js"
import { projectTable } from "../src/project/db/projectTable.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runTable } from "../src/run/db/runTable.js"
import type { RunBudget } from "../src/run/schema/runBudgetSchema.js"
import type { RunExecutionSnapshot } from "../src/run/schema/runExecutionSnapshotSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { sessionViewRepositoryAcknowledge } from "../src/session/db/sessionViewRepositoryAcknowledge.js"
import { sessionViewTable } from "../src/session/db/sessionViewTable.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"

const directory = await mkdtemp(path.join(os.tmpdir(), "codeline-session-view-acknowledge."))
const filePath = path.join(directory, "db.sqlite")
const migrated = await databaseMigrate(filePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(filePath)
const database = connection.db

const fixture = {
  agentId: "session-view-agent",
  organizationId: "session-view-organization",
  projectId: "session-view-project",
  projectPath: "/tmp/session-view-project",
  serverId: "session-view-server",
  sessionId: "session-view-session",
  userId: "session-view-user",
}
const rootFinishedAt = new Date("2026-08-29T12:00:00.000Z")
const childFinishedAt = new Date("2026-08-29T13:00:00.000Z")
const runBudget: RunBudget = { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 }
const runSnapshot: RunExecutionSnapshot = {
  configuration: {
    model: "session-view-model",
    provider: "deterministic",
    tools: { bash: false, webfetch: false },
  },
  configurationRevision: "session-view-revision",
  target: { agentId: fixture.agentId, serverId: fixture.serverId },
}

await database.insert(applicationUserTable).values({ displayName: "Session View User", id: fixture.userId })
await database
  .insert(organizationTable)
  .values({ externalId: fixture.organizationId, id: fixture.organizationId, name: "Session View Organization" })
await database.insert(serverTable).values({
  endpoint: "https://session-view.test",
  id: fixture.serverId,
  name: "Session View Server",
  organizationId: fixture.organizationId,
})
await database.insert(agentTable).values({
  configuration: {},
  id: fixture.agentId,
  name: "Session View Agent",
  role: "coding",
  serverId: fixture.serverId,
})
await database.insert(projectTable).values({
  id: fixture.projectId,
  path: fixture.projectPath,
  userId: fixture.userId,
})
await database.insert(sessionTable).values({
  clientRequestId: "session-view-request",
  id: fixture.sessionId,
  primaryAgentId: fixture.agentId,
  projectPath: fixture.projectPath,
  serverId: fixture.serverId,
  title: "Session View",
  userId: fixture.userId,
})
const rootRun = {
  budget: runBudget,
  clientRunId: "session-view-root-client",
  deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
  finishedAt: rootFinishedAt,
  id: "session-view-root-run",
  sessionId: fixture.sessionId,
  snapshot: runSnapshot,
  status: "succeeded",
  streamId: "session-view-root-stream",
  userId: fixture.userId,
} satisfies typeof runTable.$inferInsert
await database.insert(runTable).values(rootRun)
const childRun = {
  budget: runBudget,
  clientRunId: "session-view-child-client",
  deadlineAt: new Date("2026-08-29T14:00:00.000Z"),
  finishedAt: childFinishedAt,
  id: "session-view-child-run",
  sessionId: fixture.sessionId,
  snapshot: runSnapshot,
  status: "failed",
  streamId: "session-view-child-stream",
  userId: fixture.userId,
} satisfies typeof runTable.$inferInsert
await database.insert(runTable).values(childRun)
const rootAttempt = {
  budget: runBudget,
  id: "session-view-root-attempt",
  ordinal: 1,
  runId: "session-view-root-run",
  sessionId: fixture.sessionId,
  snapshot: runSnapshot,
  status: "succeeded",
  streamId: "session-view-root-attempt-stream",
  userId: fixture.userId,
} satisfies typeof attemptTable.$inferInsert
await database.insert(attemptTable).values(rootAttempt)
const childAttempt = {
  budget: runBudget,
  id: "session-view-child-attempt",
  ordinal: 1,
  runId: "session-view-child-run",
  sessionId: fixture.sessionId,
  snapshot: runSnapshot,
  status: "failed",
  streamId: "session-view-child-attempt-stream",
  userId: fixture.userId,
} satisfies typeof attemptTable.$inferInsert
await database.insert(attemptTable).values(childAttempt)
await database.insert(runDelegationTable).values({
  childRunId: "session-view-child-run",
  delegationKey: "session-view-child-delegation",
  depth: 1,
  id: "session-view-delegation",
  parentAttemptId: "session-view-root-attempt",
  parentRunId: "session-view-root-run",
  rootOrdinal: 1,
  rootRunId: "session-view-root-run",
  sessionId: fixture.sessionId,
  task: "child task",
  userId: fixture.userId,
})

test("acknowledges only the latest root terminal run and remains monotonic", async () => {
  const first = await sessionViewRepositoryAcknowledge(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
  )
  expect(first).toMatchObject({
    success: true,
    data: { acknowledgedFinishedAt: rootFinishedAt, changed: true },
  })

  const repeated = await sessionViewRepositoryAcknowledge(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
  )
  expect(repeated).toMatchObject({ success: true, data: { acknowledgedFinishedAt: rootFinishedAt, changed: false } })

  const status = await projectFolderStatusList(database, fixture.userId, fixture.organizationId)
  expect(status).toMatchObject({ data: [{ projectId: fixture.projectId, unseenEnded: false }] })
})

test("the authenticated acknowledgement route emits one session-list invalidation", async () => {
  const cursorCodec = journalCursorCodecCreate({ randomBytes, secret: "session-view-acknowledgement-test" })
  if (!cursorCodec.success) throw new Error(cursorCodec.errorMessage)
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("requestIdentity", { organizationId: fixture.organizationId, userId: fixture.userId })
    await next()
  })
  apiSessionRoutesAdd(app, {
    database,
    journalCursorCodec: cursorCodec.data,
    journalPostCommitPublish: async () => createResult(undefined),
  })

  await database
    .update(sessionViewTable)
    .set({ acknowledgedFinishedAt: new Date("2026-08-29T11:00:00.000Z") })
    .where(and(eq(sessionViewTable.userId, fixture.userId), eq(sessionViewTable.sessionId, fixture.sessionId)))

  const invalid = await app.request("http://codeline.test/sessions/session-view-session/view", {
    body: "not-json",
    method: "POST",
  })
  expect(invalid.status).toBe(400)

  const acknowledged = await app.request("http://codeline.test/sessions/session-view-session/view", { method: "POST" })
  expect(acknowledged.status).toBe(200)
  expect(await acknowledged.json()).toEqual({
    acknowledgedFinishedAt: rootFinishedAt.toISOString(),
    sessionId: fixture.sessionId,
  })

  const events = await database.select().from(journalEventTable)
  expect(events).toHaveLength(1)
  expect(events[0]?.payload).toMatchObject({ resourceId: fixture.userId, resourceType: "session-list" })

  const repeated = await app.request("http://codeline.test/sessions/session-view-session/view", {
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(repeated.status).toBe(200)
  expect(await database.select().from(journalEventTable)).toHaveLength(1)

  const unauthorizedApp = new Hono<AppEnvironment>()
  unauthorizedApp.use("*", async (context, next) => {
    context.set("requestIdentity", { organizationId: "another-organization", userId: fixture.userId })
    await next()
  })
  apiSessionRoutesAdd(unauthorizedApp, {
    database,
    journalCursorCodec: cursorCodec.data,
    journalPostCommitPublish: async () => createResult(undefined),
  })
  const unauthorized = await unauthorizedApp.request("http://codeline.test/sessions/session-view-session/view", {
    method: "POST",
  })
  expect(unauthorized.status).toBe(404)
})

afterAll(async () => {
  connection.client.close()
  await rm(directory, { force: true, recursive: true })
})
