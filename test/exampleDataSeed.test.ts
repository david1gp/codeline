import { afterAll, beforeAll, expect, test } from "bun:test"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const sessionIds = exampleDataFixture.sessions.map((session) => session.id)
const messageIds = exampleDataFixture.sessions.flatMap((session) => session.messages.map((message) => message.id))
const unrelated = {
  agentId: `seed-test-agent-${uuidv7()}`,
  serverId: `seed-test-server-${uuidv7()}`,
  userId: `development:seed-test-${uuidv7()}`,
  identityKey: `seed-test-${uuidv7()}`,
  sessionId: `seed-test-session-${uuidv7()}`,
  descendantSessionId: `seed-test-descendant-session-${uuidv7()}`,
  messageId: `seed-test-message-${uuidv7()}`,
}

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(developmentUserTable).values({
    id: unrelated.userId,
    identityKey: unrelated.identityKey,
    displayName: "Unrelated Seed Test User",
  })
  await database.insert(serverTable).values({
    id: unrelated.serverId,
    ownerUserId: unrelated.userId,
    name: "Unrelated Seed Test Server",
    endpoint: "http://unrelated-seed-test.test",
  })
  await database.insert(agentTable).values({
    id: unrelated.agentId,
    serverId: unrelated.serverId,
    name: "Unrelated Seed Test Agent",
    role: "coding",
  })
  await database.insert(sessionTable).values({
    id: unrelated.sessionId,
    userId: unrelated.userId,
    serverId: unrelated.serverId,
    primaryAgentId: unrelated.agentId,
    title: "Unrelated seed test session",
    clientRequestId: `seed-test-request-${uuidv7()}`,
  })
  await database.insert(messageTable).values({
    id: unrelated.messageId,
    sessionId: unrelated.sessionId,
    agentId: unrelated.agentId,
    role: "user",
    sequence: 1,
    content: "Unrelated content must remain.",
    clientRequestId: `seed-test-message-request-${uuidv7()}`,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(sessionTable).where(eq(sessionTable.id, unrelated.descendantSessionId))
    await database.delete(developmentUserTable).where(eq(developmentUserTable.id, unrelated.userId))
  }
  await client.end()
})

test("the typed fixture has stable counts, IDs, timestamps, and content", () => {
  expect(exampleDataFixture.user.id).toBe("development:local-development")
  expect(exampleDataFixture.server.id).toBe("example-server-local")
  expect(exampleDataFixture.agent.id).toBe("example-agent-local")
  expect(exampleDataFixture.sessions).toHaveLength(3)
  expect(exampleDataFixture.sessions.filter((session) => session.archivedAt === null)).toHaveLength(2)
  expect(exampleDataFixture.sessions.flatMap((session) => session.messages)).toHaveLength(6)
  expect(exampleDataFixture.sessions[0]?.messages[1]?.content).toBe("The workspace shell is ready for local sessions.")
  expect(exampleDataFixture.sessions.map((session) => session.parentSessionId)).toEqual([
    null,
    "example-session-active-1",
    "example-session-active-2",
  ])
})

test.skipIf(!databaseAvailable)("reset preserves unrelated data and descendant links", async () => {
  const first = await exampleDataSeed(database)
  expect(first).toEqual({ success: true, data: { sessionCount: 3, messageCount: 6 } })
  const second = await exampleDataSeed(database)
  expect(second).toEqual(first)

  const sessions = await database.select().from(sessionTable).where(inArray(sessionTable.id, sessionIds))
  const messages = await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))
  expect(sessions).toHaveLength(3)
  expect(sessions.filter((session) => session.archivedAt === null)).toHaveLength(2)
  expect(sessions.find((session) => session.id === "example-session-active-2")?.parentSessionId).toBe(
    "example-session-active-1",
  )
  expect(messages).toHaveLength(6)
  expect(messages.find((message) => message.id === "example-message-active-2-assistant")?.content).toBe(
    "The synchronized message view is available.",
  )
  const firstSnapshot = {
    sessions: [...sessions].sort((left, right) => left.id.localeCompare(right.id)),
    messages: [...messages].sort((left, right) => left.id.localeCompare(right.id)),
  }

  const third = await exampleDataSeed(database)
  expect(third).toEqual(first)
  const secondSnapshot = {
    sessions: (await database.select().from(sessionTable).where(inArray(sessionTable.id, sessionIds))).sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
    messages: (await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))).sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
  }
  expect(secondSnapshot).toEqual(firstSnapshot)

  const unrelatedRows = await database
    .select({ sessionId: sessionTable.id, messageId: messageTable.id })
    .from(sessionTable)
    .innerJoin(messageTable, and(eq(messageTable.sessionId, sessionTable.id), eq(messageTable.id, unrelated.messageId)))
    .where(eq(sessionTable.id, unrelated.sessionId))
  expect(unrelatedRows).toEqual([{ sessionId: unrelated.sessionId, messageId: unrelated.messageId }])

  await database.insert(sessionTable).values({
    id: unrelated.descendantSessionId,
    userId: exampleDataFixture.user.id,
    serverId: exampleDataFixture.server.id,
    primaryAgentId: exampleDataFixture.agent.id,
    parentSessionId: "example-session-active-1",
    title: "User-created fixture descendant",
    clientRequestId: `seed-test-descendant-request-${uuidv7()}`,
  })

  const reset = await exampleDataSeed(database, { reset: true })
  expect(reset).toEqual(first)
  const afterReset = await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))
  expect(afterReset).toHaveLength(6)
  const descendantAfterReset = await database
    .select({ parentSessionId: sessionTable.parentSessionId })
    .from(sessionTable)
    .where(eq(sessionTable.id, unrelated.descendantSessionId))
  expect(descendantAfterReset).toEqual([{ parentSessionId: "example-session-active-1" }])
})
