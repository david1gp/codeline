import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageCopyFinalizedPrefix } from "../src/message/actions/messageCopyFinalizedPrefix.js"
import { messagePrepare } from "../src/message/actions/messagePrepare.js"
import { messageRepositoryAppendMutation } from "../src/message/db/messageRepositoryAppendMutation.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-message-append."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: `message-test-agent-${uuidv7()}`,
  serverId: `message-test-server-${uuidv7()}`,
  userKey: `message-test-user-${uuidv7()}`,
}
let userId: string | undefined

beforeAll(async () => {
  const user = await developmentIdentityUpsert(database, {
    displayName: "Message Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Message Test Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://message-test-server.test",
    id: fixture.serverId,
    name: "Message Test Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Message Test Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("message append allocates sequence and is idempotent in a transaction", async () => {
  if (userId === undefined) return

  const sessionResult = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message test session",
    },
    { organizationId: userId },
  )
  expect(sessionResult.success).toBe(true)
  if (!sessionResult.success) return
  const testUserId = userId
  const sessionId = sessionResult.data.session.id
  const initialUpdatedAt = sessionResult.data.session.updatedAt
  const firstRequest = {
    clientRequestId: `message-request-${uuidv7()}`,
    content: "hello",
    role: "user" as const,
  }

  const first = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, firstRequest),
  )
  expect(first).toMatchObject({ success: true, data: { created: true, message: { role: "user", sequence: 1 } } })
  if (!first.success) return

  const repeated = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, firstRequest),
  )
  expect(repeated).toMatchObject({ success: true, data: { created: false, message: { id: first.data.message.id } } })

  const conflicting = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, { ...firstRequest, content: "different" }),
  )
  expect(conflicting).toMatchObject({
    success: false,
    errorMessage: "The message client request ID was already used with different content.",
  })

  const second = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, {
      clientRequestId: `message-request-${uuidv7()}`,
      content: "reply",
      role: "assistant",
    }),
  )
  expect(second).toMatchObject({ success: true, data: { created: true, message: { sequence: 2 } } })
  if (!second.success) return

  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, sessionId))
    .orderBy(asc(sessionHistoryEntryTable.position))
  expect(historyEntries).toHaveLength(2)
  expect(historyEntries.map((entry) => entry.sourceId)).toEqual([first.data.message.id, second.data.message.id])
  expect(historyEntries.map((entry) => entry.position)).toEqual([1, 2])
  expect(historyEntries[0]?.payload).toMatchObject({
    content: "hello",
    id: first.data.message.id,
    role: "user",
    sequence: 1,
  })

  const loadedBeforeArchive = await sessionLoad(database, userId, userId, sessionId)
  expect(loadedBeforeArchive).toMatchObject({ success: true, data: { session: { updatedAt: expect.anything() } } })
  if (!loadedBeforeArchive.success) return
  const [activity] = await database
    .select({ updatedAt: sessionTable.updatedAt })
    .from(sessionTable)
    .where(eq(sessionTable.id, sessionId))
  expect(activity?.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime())
  const archived = await sessionArchive(database, userId, sessionId)
  expect(archived.success).toBe(true)
  const rejected = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, {
      clientRequestId: `message-request-${uuidv7()}`,
      content: "not allowed",
      role: "user",
    }),
  )
  expect(rejected).toMatchObject({ success: false, errorMessage: "The session is archived." })
})

test("message mutation append projects one stable entry across retries", async () => {
  if (userId === undefined) return

  const sessionResult = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-mutation-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message mutation test session",
    },
    { organizationId: userId },
  )
  expect(sessionResult.success).toBe(true)
  if (!sessionResult.success) return

  const input = {
    clientRequestId: `message-mutation-request-${uuidv7()}`,
    content: "mutation message",
    role: "user" as const,
  }
  const first = await messageRepositoryAppendMutation(database, userId, userId, sessionResult.data.session.id, input)
  expect(first).toMatchObject({ success: true, data: { created: true, replayed: false } })
  if (!first.success) return

  const repeated = await messageRepositoryAppendMutation(database, userId, userId, sessionResult.data.session.id, input)
  expect(repeated).toMatchObject({ success: true, data: { created: false, replayed: true } })

  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, sessionResult.data.session.id))
  expect(historyEntries).toHaveLength(1)
  expect(historyEntries[0]).toMatchObject({
    kind: "message",
    sourceId: first.data.responseBody.message.id,
    sourceType: "message",
    position: 1,
    changePosition: 1,
  })
})

test("message append rolls back the canonical message when projection allocation fails", async () => {
  if (userId === undefined) return

  const sessionResult = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-rollback-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message rollback test session",
    },
    { organizationId: userId },
  )
  expect(sessionResult.success).toBe(true)
  if (!sessionResult.success) return
  const sessionId = sessionResult.data.session.id
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER })
    .where(eq(sessionTable.id, sessionId))

  const appended = await messageAppend(database, userId, sessionId, {
    clientRequestId: `message-rollback-request-${uuidv7()}`,
    content: "must roll back",
    role: "user",
  })
  expect(appended).toMatchObject({
    success: false,
    errorMessage: "The session could not be found or has exhausted history positions.",
  })

  const messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, sessionId))
  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
  expect(messages).toHaveLength(0)
  expect(historyEntries).toHaveLength(0)
  expect(session).toMatchObject({ nextHistoryPosition: Number.MAX_SAFE_INTEGER, revision: 1 })
})

test("branch prefix copy projects target messages in canonical order", async () => {
  if (userId === undefined) return

  const source = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-copy-projection-source-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy projection source",
    },
    { organizationId: userId },
  )
  const target = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-copy-projection-target-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy projection target",
    },
    { organizationId: userId },
  )
  expect(source.success).toBe(true)
  expect(target.success).toBe(true)
  if (!source.success || !target.success) return

  const sourceMessage = await messageAppend(database, userId, source.data.session.id, {
    clientRequestId: `message-copy-projection-message-1-${uuidv7()}`,
    content: "first copied message",
    role: "user",
  })
  const selectedMessage = await messageAppend(database, userId, source.data.session.id, {
    clientRequestId: `message-copy-projection-message-2-${uuidv7()}`,
    content: "second copied message",
    role: "assistant",
  })
  expect(sourceMessage.success).toBe(true)
  expect(selectedMessage.success).toBe(true)
  if (!sourceMessage.success || !selectedMessage.success) return

  const copied = await messageCopyFinalizedPrefix(
    database,
    userId,
    source.data.session.id,
    target.data.session.id,
    selectedMessage.data.message.id,
  )
  expect(copied).toMatchObject({ success: true, data: [{ sequence: 1 }, { sequence: 2 }] })
  if (!copied.success) return

  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, target.data.session.id))
    .orderBy(asc(sessionHistoryEntryTable.position))
  expect(historyEntries).toHaveLength(2)
  expect(historyEntries.map((entry) => entry.sourceId)).toEqual(copied.data.map((message) => message.id))
  expect(historyEntries.map((entry) => entry.position)).toEqual([1, 2])
  expect(historyEntries.map((entry) => entry.payload)).toMatchObject([
    { content: "first copied message", role: "user", sequence: 1 },
    { content: "second copied message", role: "assistant", sequence: 2 },
  ])
})

test("branch prefix copy rolls back copied messages when projection allocation fails", async () => {
  if (userId === undefined) return

  const source = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-copy-rollback-source-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy rollback source",
    },
    { organizationId: userId },
  )
  const target = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-copy-rollback-target-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy rollback target",
    },
    { organizationId: userId },
  )
  expect(source.success).toBe(true)
  expect(target.success).toBe(true)
  if (!source.success || !target.success) return

  const message = await messageAppend(database, userId, source.data.session.id, {
    clientRequestId: `message-copy-rollback-message-${uuidv7()}`,
    content: "copy rollback message",
    role: "user",
  })
  expect(message.success).toBe(true)
  if (!message.success) return
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER })
    .where(eq(sessionTable.id, target.data.session.id))

  const copied = await messageCopyFinalizedPrefix(
    database,
    userId,
    source.data.session.id,
    target.data.session.id,
    message.data.message.id,
  )
  expect(copied).toMatchObject({
    success: false,
    errorMessage: "The session could not be found or has exhausted history positions.",
  })

  const messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, target.data.session.id))
  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, target.data.session.id))
  expect(messages).toHaveLength(0)
  expect(historyEntries).toHaveLength(0)
  const [targetSession] = await database
    .select({ nextHistoryPosition: sessionTable.nextHistoryPosition })
    .from(sessionTable)
    .where(eq(sessionTable.id, target.data.session.id))
  expect(targetSession?.nextHistoryPosition).toBe(Number.MAX_SAFE_INTEGER)
})

test("message preparation deduplicates and returns ordered durable history", async () => {
  if (userId === undefined) return

  const sessionResult = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-prepare-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message prepare test session",
    },
    { organizationId: userId },
  )
  expect(sessionResult.success).toBe(true)
  if (!sessionResult.success) return

  const request = { clientRequestId: `message-prepare-request-${uuidv7()}`, content: "hello" }
  const first = await messagePrepare(database, userId, sessionResult.data.session.id, request)
  expect(first).toMatchObject({ success: true, data: { history: [{ sequence: 1 }], userMessage: { sequence: 1 } } })
  if (!first.success) return

  const assistant = await messageAppend(database, userId, sessionResult.data.session.id, {
    clientRequestId: `message-prepare-assistant-${uuidv7()}`,
    content: "reply",
    role: "assistant",
  })
  expect(assistant).toMatchObject({ success: true, data: { message: { sequence: 2 } } })
  if (!assistant.success) return

  const repeated = await messagePrepare(database, userId, sessionResult.data.session.id, request)
  expect(repeated).toMatchObject({
    success: true,
    data: {
      history: [
        { id: first.data.userMessage.id, sequence: 1, content: "hello" },
        { id: assistant.data.message.id, sequence: 2, content: "reply" },
      ],
      userMessage: { id: first.data.userMessage.id },
    },
  })
})

test("message prefix copy cannot write into another user's session", async () => {
  if (userId === undefined) return

  const source = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-copy-source-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy source",
    },
    { organizationId: userId },
  )
  expect(source.success).toBe(true)
  if (!source.success) return

  const message = await messageAppend(database, userId, source.data.session.id, {
    clientRequestId: `message-copy-source-message-${uuidv7()}`,
    content: "private source message",
    role: "user",
  })
  expect(message.success).toBe(true)
  if (!message.success) return

  const otherUser = await developmentIdentityUpsert(database, {
    displayName: "Message Copy Other User",
    identityKey: `message-copy-other-user-${uuidv7()}`,
  })
  expect(otherUser.success).toBe(true)
  if (!otherUser.success) return

  const target = await sessionCreate(
    database,
    otherUser.data.id,
    {
      clientRequestId: `message-copy-target-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message copy target",
    },
    { organizationId: userId },
  )
  expect(target.success).toBe(true)
  if (!target.success) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, otherUser.data.id))
    return
  }

  const copied = await messageCopyFinalizedPrefix(
    database,
    userId,
    source.data.session.id,
    target.data.session.id,
    message.data.message.id,
  )
  expect(copied).toMatchObject({ success: false, errorMessage: "The target session could not be found." })

  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, otherUser.data.id))
})
