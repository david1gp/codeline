import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { sessionCompactionBegin } from "../src/compaction/actions/sessionCompactionBegin.js"
import { sessionCompactionFail } from "../src/compaction/actions/sessionCompactionFail.js"
import { sessionCompactionFinalize } from "../src/compaction/actions/sessionCompactionFinalize.js"
import { sessionCompactionLoadLatestSuccessful } from "../src/compaction/actions/sessionCompactionLoadLatestSuccessful.js"
import { sessionCompactionTable } from "../src/compaction/db/sessionCompactionTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-compaction."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-compaction-agent",
  organizationId: "session-compaction-organization",
  otherUserId: "session-compaction-other-user",
  serverId: "session-compaction-server",
  sessionId: "session-compaction-session",
  userId: "session-compaction-user",
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Session Compaction User", id: fixture.userId },
    { displayName: "Other Session Compaction User", id: fixture.otherUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Session Compaction Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-compaction.test",
    id: fixture.serverId,
    name: "Session Compaction Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Compaction Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(sessionTable).values({
    clientRequestId: "session-compaction-request",
    id: fixture.sessionId,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Session Compaction Session",
    userId: fixture.userId,
  })
  await database.insert(messageTable).values([
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-message-1",
      content: "first source message",
      id: "session-compaction-message-1",
      role: "user",
      sequence: 1,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-message-2",
      content: "second source message",
      id: "session-compaction-message-2",
      role: "assistant",
      sequence: 2,
      sessionId: fixture.sessionId,
    },
  ])
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("compaction lifecycle authorizes access, preserves messages, and is idempotent", async () => {
  const sourceMessages = await database.select().from(messageTable).where(eq(messageTable.sessionId, fixture.sessionId))
  const begun = await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    coveredSequence: 1,
    id: "session-compaction-operation-1",
    sourceRevision: 1,
  })
  expect(begun).toMatchObject({ success: true, data: { compaction: { status: "running" }, created: true } })
  if (!begun.success) return

  const repeatedBegin = await sessionCompactionBegin(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { coveredSequence: 1, id: begun.data.compaction.id, sourceRevision: 1 },
  )
  expect(repeatedBegin).toMatchObject({ success: true, data: { created: false } })

  const activeConflict = await sessionCompactionBegin(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { coveredSequence: 1, id: "session-compaction-operation-other", sourceRevision: 1 },
  )
  expect(activeConflict).toMatchObject({
    success: false,
    errorMessage: "A compaction is already active for the session.",
  })

  expect(
    await sessionCompactionLoadLatestSuccessful(database, fixture.userId, fixture.organizationId, fixture.sessionId),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCompactionFinalize(database, fixture.otherUserId, fixture.organizationId, fixture.sessionId, {
      compactionId: begun.data.compaction.id,
      summary: "must not finalize",
    }),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const finalized = await sessionCompactionFinalize(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { compactionId: begun.data.compaction.id, summary: "summary one" },
  )
  expect(finalized).toMatchObject({
    success: true,
    data: { changed: true, compaction: { status: "succeeded", summary: "summary one" }, session: { revision: 2 } },
  })
  expect(
    await sessionCompactionLoadLatestSuccessful(database, fixture.userId, fixture.organizationId, fixture.sessionId),
  ).toMatchObject({ success: true, data: { compactionVersion: 1, coveredSequence: 1, summary: "summary one" } })
  expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, fixture.sessionId))).toEqual(
    sourceMessages,
  )

  const repeatedFinalize = await sessionCompactionFinalize(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { compactionId: begun.data.compaction.id, summary: "summary one" },
  )
  expect(repeatedFinalize).toMatchObject({ success: true, data: { changed: false, session: { revision: 2 } } })

  const failedBegin = await sessionCompactionBegin(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    {
      coveredSequence: 2,
      id: "session-compaction-operation-2",
      sourceRevision: 2,
    },
  )
  expect(failedBegin.success).toBe(true)
  if (!failedBegin.success) return
  const failed = await sessionCompactionFail(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    compactionId: failedBegin.data.compaction.id,
    errorMessage: "summary generation failed",
  })
  expect(failed).toMatchObject({ success: true, data: { changed: true, compaction: { status: "failed" } } })
  expect(
    await sessionCompactionLoadLatestSuccessful(database, fixture.userId, fixture.organizationId, fixture.sessionId),
  ).toMatchObject({ success: true, data: { compactionVersion: 1, summary: "summary one" } })
  expect(
    await sessionCompactionFail(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      compactionId: failedBegin.data.compaction.id,
      errorMessage: "summary generation failed",
    }),
  ).toMatchObject({ success: true, data: { changed: false } })

  expect(
    await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      coveredSequence: 1,
      id: "session-compaction-operation-regressed-sequence",
      sourceRevision: 2,
    }),
  ).toMatchObject({ success: false, errorMessage: "The compaction source cannot move backwards." })
  expect(
    await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      coveredSequence: 3,
      id: "session-compaction-operation-regressed-revision",
      sourceRevision: 1,
    }),
  ).toMatchObject({
    success: false,
    errorMessage: "The compaction source revision does not match the session revision.",
  })
  expect((await database.select().from(sessionTable).where(eq(sessionTable.id, fixture.sessionId)))[0]?.revision).toBe(
    2,
  )
})

test("compaction actions do not cross user or organization session boundaries", async () => {
  const before = await database
    .select()
    .from(sessionCompactionTable)
    .where(eq(sessionCompactionTable.sessionId, fixture.sessionId))

  expect(
    await sessionCompactionBegin(database, fixture.otherUserId, fixture.organizationId, fixture.sessionId, {
      coveredSequence: 0,
      id: "session-compaction-unauthorized-begin",
      sourceRevision: 2,
    }),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })
  expect(
    await sessionCompactionLoadLatestSuccessful(database, fixture.userId, "other-organization", fixture.sessionId),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })
  expect(
    await sessionCompactionFail(database, fixture.otherUserId, fixture.organizationId, fixture.sessionId, {
      compactionId: "session-compaction-operation-1",
      errorMessage: "must not fail",
    }),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const after = await database
    .select()
    .from(sessionCompactionTable)
    .where(eq(sessionCompactionTable.sessionId, fixture.sessionId))
  expect(after).toEqual(before)
})

test("compaction reservation is serialized so concurrent starts leave one active row", async () => {
  const results = await Promise.all([
    sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      coveredSequence: 3,
      id: "session-compaction-operation-concurrent-1",
      sourceRevision: 2,
    }),
    sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      coveredSequence: 3,
      id: "session-compaction-operation-concurrent-2",
      sourceRevision: 2,
    }),
  ])
  expect(results.filter((result) => result.success)).toHaveLength(1)
  expect(results.filter((result) => !result.success)).toHaveLength(1)

  const active = await database
    .select()
    .from(sessionCompactionTable)
    .where(and(eq(sessionCompactionTable.sessionId, fixture.sessionId), eq(sessionCompactionTable.status, "running")))
  expect(active).toHaveLength(1)
})
