import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { sessionCompactionBegin } from "../src/compaction/actions/sessionCompactionBegin.js"
import { sessionCompactionContextReconstruct } from "../src/compaction/actions/sessionCompactionContextReconstruct.js"
import { sessionCompactionFail } from "../src/compaction/actions/sessionCompactionFail.js"
import { sessionCompactionFinalize } from "../src/compaction/actions/sessionCompactionFinalize.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChatPrepare } from "../src/session/actions/sessionChatPrepare.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-compaction-context."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-compaction-context-agent",
  noRecordSessionId: "session-compaction-context-no-record",
  organizationId: "session-compaction-context-organization",
  otherUserId: "session-compaction-context-other-user",
  serverId: "session-compaction-context-server",
  sessionId: "session-compaction-context-session",
  userId: "session-compaction-context-user",
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Session Compaction Context User", id: fixture.userId },
    { displayName: "Other Session Compaction Context User", id: fixture.otherUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Session Compaction Context Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-compaction-context.test",
    id: fixture.serverId,
    name: "Session Compaction Context Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Compaction Context Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(sessionTable).values([
    {
      clientRequestId: "session-compaction-context-request",
      id: fixture.sessionId,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Session Compaction Context Session",
      userId: fixture.userId,
    },
    {
      clientRequestId: "session-compaction-context-no-record-request",
      id: fixture.noRecordSessionId,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Session Compaction Context No Record Session",
      userId: fixture.userId,
    },
  ])
  await database.insert(messageTable).values([
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-message-1",
      content: "covered one",
      id: "session-compaction-context-message-1",
      role: "user",
      sequence: 1,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-message-2",
      content: "covered two",
      id: "session-compaction-context-message-2",
      role: "assistant",
      sequence: 2,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-message-3",
      content: "retained three",
      id: "session-compaction-context-message-3",
      role: "user",
      sequence: 3,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-message-4",
      content: "retained four",
      id: "session-compaction-context-message-4",
      role: "assistant",
      sequence: 4,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-message-5",
      content: "new five",
      id: "session-compaction-context-message-5",
      role: "user",
      sequence: 5,
      sessionId: fixture.sessionId,
    },
    {
      agentId: fixture.agentId,
      clientRequestId: "session-compaction-context-no-record-message",
      content: "full history",
      id: "session-compaction-context-no-record-message",
      role: "user",
      sequence: 1,
      sessionId: fixture.noRecordSessionId,
    },
  ])

  const first = await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    coveredSequence: 2,
    id: "session-compaction-context-operation-1",
    sourceRevision: 1,
  })
  if (!first.success) throw new Error(first.errorMessage)
  const firstFinalized = await sessionCompactionFinalize(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { compactionId: first.data.compaction.id, summary: "first summary" },
  )
  if (!firstFinalized.success) throw new Error(firstFinalized.errorMessage)

  const second = await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    coveredSequence: 4,
    id: "session-compaction-context-operation-2",
    sourceRevision: 2,
  })
  if (!second.success) throw new Error(second.errorMessage)
  const secondFinalized = await sessionCompactionFinalize(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { compactionId: second.data.compaction.id, summary: "latest summary" },
  )
  if (!secondFinalized.success) throw new Error(secondFinalized.errorMessage)

  const failed = await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    coveredSequence: 5,
    id: "session-compaction-context-operation-failed",
    sourceRevision: 3,
  })
  if (!failed.success) throw new Error(failed.errorMessage)
  const failedFinalized = await sessionCompactionFail(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    { compactionId: failed.data.compaction.id, errorMessage: "incomplete summary" },
  )
  if (!failedFinalized.success) throw new Error(failedFinalized.errorMessage)

  const running = await sessionCompactionBegin(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    coveredSequence: 5,
    id: "session-compaction-context-operation-running",
    sourceRevision: 3,
  })
  if (!running.success) throw new Error(running.errorMessage)
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("projects an exact full history when no compaction record exists", async () => {
  const source = await database.select().from(messageTable).where(eq(messageTable.sessionId, fixture.noRecordSessionId))
  const result = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.noRecordSessionId,
  )

  expect(result).toMatchObject({ success: true, data: { compaction: undefined, history: source } })
  if (result.success) expect(result.data.durableHistory).toEqual(source)
})

test("keeps the prepared user message in the projected history", async () => {
  const result = await sessionChatPrepare(database, fixture.userId, fixture.organizationId, fixture.noRecordSessionId, {
    clientRequestId: "session-compaction-context-prepared-user",
    content: "prepared user",
  })

  expect(result).toMatchObject({
    success: true,
    data: {
      history: [{ sequence: 1 }, { sequence: 2, content: "prepared user" }],
      userMessage: { sequence: 2, content: "prepared user" },
    },
  })
})

test("uses the latest successful summary with the retained tail and new messages", async () => {
  const before = await database.select().from(messageTable).where(eq(messageTable.sessionId, fixture.sessionId))
  const result = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
  )

  expect(result).toMatchObject({
    success: true,
    data: {
      compaction: { compactionVersion: 2, coveredSequence: 4, status: "succeeded", summary: "latest summary" },
      history: [{ id: "compaction-summary", role: "system", content: "latest summary" }, { sequence: 5 }],
    },
  })
  if (result.success) {
    expect(result.data.history.map((message) => message.id)).toEqual([
      "compaction-summary",
      "session-compaction-context-message-5",
    ])
  }

  const after = await database.select().from(messageTable).where(eq(messageTable.sessionId, fixture.sessionId))
  expect(after).toEqual(before)
})

test("excludes failed and running compactions from reconstruction", async () => {
  const result = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
  )

  expect(result).toMatchObject({
    success: true,
    data: { compaction: { compactionVersion: 2, status: "succeeded", summary: "latest summary" } },
  })
})

test("keeps a newly prepared user message after a compaction boundary", async () => {
  const result = await sessionChatPrepare(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    clientRequestId: "session-compaction-context-prepared-after-compaction",
    content: "new prepared message",
  })

  expect(result).toMatchObject({
    success: true,
    data: {
      history: [
        { id: "compaction-summary", role: "system", content: "latest summary" },
        { id: "session-compaction-context-message-5", role: "user", content: "new five" },
        { role: "user", content: "new prepared message" },
      ],
      userMessage: { role: "user", content: "new prepared message", sequence: 6 },
    },
  })
})

test("authorizes reconstruction by user and organization", async () => {
  expect(
    await sessionCompactionContextReconstruct(database, fixture.otherUserId, fixture.organizationId, fixture.sessionId),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })
  expect(
    await sessionCompactionContextReconstruct(database, fixture.userId, "other-organization", fixture.sessionId),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })
})
