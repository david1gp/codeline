import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageCopyFinalizedPrefix } from "../src/message/actions/messageCopyFinalizedPrefix.js"
import { messagePrepare } from "../src/message/actions/messagePrepare.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `message-test-agent-${uuidv7()}`,
  serverId: `message-test-server-${uuidv7()}`,
  userKey: `message-test-user-${uuidv7()}`,
}
let userId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return

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
})

test.skipIf(!databaseAvailable)("message append allocates sequence and is idempotent in a transaction", async () => {
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

test.skipIf(!databaseAvailable)("message preparation deduplicates and returns ordered durable history", async () => {
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

test.skipIf(!databaseAvailable)("message prefix copy cannot write into another user's session", async () => {
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
