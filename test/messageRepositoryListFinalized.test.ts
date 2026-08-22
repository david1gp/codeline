import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messagePageResponseSchema } from "../src/message/api/messagePageResponseSchema.js"
import { messageListCursorCodecCreate } from "../src/message/db/messageListCursorCodecCreate.js"
import { messageRepositoryListFinalized as messageRepositoryListFinalizedRun } from "../src/message/db/messageRepositoryListFinalized.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentAId: `message-list-agent-a-${uuidv7()}`,
  agentBId: `message-list-agent-b-${uuidv7()}`,
  organizationAId: `message-list-organization-a-${uuidv7()}`,
  organizationBId: `message-list-organization-b-${uuidv7()}`,
  serverAId: `message-list-server-a-${uuidv7()}`,
  serverBId: `message-list-server-b-${uuidv7()}`,
  userAKey: `message-list-user-a-${uuidv7()}`,
  userBKey: `message-list-user-b-${uuidv7()}`,
}
const journalCodecResult = journalCursorCodecCreate({ randomBytes, secret: `message-list-${uuidv7()}` })

function messageRepositoryListFinalized(
  ...input: Parameters<typeof messageRepositoryListFinalizedRun> extends [...infer Prefix, infer _Dependencies]
    ? Prefix
    : never
) {
  if (!journalCodecResult.success) throw new Error(journalCodecResult.errorMessage)
  return messageRepositoryListFinalizedRun(...input, { cursorCodec: journalCodecResult.data })
}

let userAId: string | undefined
let userBId: string | undefined
let sessionAId: string | undefined
let emptySessionId: string | undefined
let siblingSessionId: string | undefined
let otherOrganizationSessionId: string | undefined
let otherUserSessionId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return

  const [userA, userB] = await Promise.all([
    developmentIdentityUpsert(database, {
      displayName: "Message List User A",
      identityKey: fixture.userAKey,
    }),
    developmentIdentityUpsert(database, {
      displayName: "Message List User B",
      identityKey: fixture.userBKey,
    }),
  ])
  if (!userA.success) throw new Error(userA.errorMessage)
  if (!userB.success) throw new Error(userB.errorMessage)
  userAId = userA.data.id
  userBId = userB.data.id

  await database.insert(organizationTable).values([
    { id: fixture.organizationAId, externalId: fixture.organizationAId, name: "Message List Organization A" },
    { id: fixture.organizationBId, externalId: fixture.organizationBId, name: "Message List Organization B" },
  ])
  await database.insert(serverTable).values([
    {
      endpoint: "http://message-list-server-a.test",
      id: fixture.serverAId,
      name: "Message List Server A",
      organizationId: fixture.organizationAId,
    },
    {
      endpoint: "http://message-list-server-b.test",
      id: fixture.serverBId,
      name: "Message List Server B",
      organizationId: fixture.organizationBId,
    },
  ])
  await database.insert(agentTable).values([
    { id: fixture.agentAId, name: "Message List Agent A", role: "coding", serverId: fixture.serverAId },
    { id: fixture.agentBId, name: "Message List Agent B", role: "coding", serverId: fixture.serverBId },
  ])

  const [sessionA, empty, sibling, otherOrganization, otherUser] = await Promise.all([
    sessionCreate(
      database,
      userAId,
      {
        clientRequestId: `message-list-session-a-${uuidv7()}`,
        metadata: {},
        primaryAgentId: fixture.agentAId,
        serverId: fixture.serverAId,
        title: "Message list session A",
      },
      { organizationId: fixture.organizationAId },
    ),
    sessionCreate(
      database,
      userAId,
      {
        clientRequestId: `message-list-empty-${uuidv7()}`,
        metadata: {},
        primaryAgentId: fixture.agentAId,
        serverId: fixture.serverAId,
        title: "Message list empty session",
      },
      { organizationId: fixture.organizationAId },
    ),
    sessionCreate(
      database,
      userAId,
      {
        clientRequestId: `message-list-sibling-${uuidv7()}`,
        metadata: {},
        primaryAgentId: fixture.agentAId,
        serverId: fixture.serverAId,
        title: "Message list sibling session",
      },
      { organizationId: fixture.organizationAId },
    ),
    sessionCreate(
      database,
      userAId,
      {
        clientRequestId: `message-list-other-organization-${uuidv7()}`,
        metadata: {},
        primaryAgentId: fixture.agentBId,
        serverId: fixture.serverBId,
        title: "Message list other organization session",
      },
      { organizationId: fixture.organizationBId },
    ),
    sessionCreate(
      database,
      userBId,
      {
        clientRequestId: `message-list-other-user-${uuidv7()}`,
        metadata: {},
        primaryAgentId: fixture.agentAId,
        serverId: fixture.serverAId,
        title: "Message list other user session",
      },
      { organizationId: fixture.organizationAId },
    ),
  ])
  if (!sessionA.success) throw new Error(sessionA.errorMessage)
  if (!empty.success) throw new Error(empty.errorMessage)
  if (!sibling.success) throw new Error(sibling.errorMessage)
  if (!otherOrganization.success) throw new Error(otherOrganization.errorMessage)
  if (!otherUser.success) throw new Error(otherUser.errorMessage)
  sessionAId = sessionA.data.session.id
  emptySessionId = empty.data.session.id
  siblingSessionId = sibling.data.session.id
  otherOrganizationSessionId = otherOrganization.data.session.id
  otherUserSessionId = otherUser.data.session.id

  await database.insert(messageTable).values([
    ...Array.from({ length: 5 }, (_, index) => ({
      agentId: fixture.agentAId,
      clientRequestId: `message-list-main-request-${index + 1}-${uuidv7()}`,
      content: `main message ${index + 1}`,
      id: `message-list-main-${index + 1}-${uuidv7()}`,
      metadata: { source: "message-list-test", ordinal: index + 1 },
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      sequence: index + 1,
      sessionId: sessionAId as string,
    })),
    {
      agentId: fixture.agentAId,
      clientRequestId: `message-list-sibling-request-${uuidv7()}`,
      content: "sibling message with the same sequence",
      id: `message-list-sibling-${uuidv7()}`,
      metadata: { source: "message-list-test", scope: "sibling" },
      role: "user" as const,
      sequence: 1,
      sessionId: siblingSessionId as string,
    },
    {
      agentId: fixture.agentBId,
      clientRequestId: `message-list-other-organization-request-${uuidv7()}`,
      content: "other organization message",
      id: `message-list-other-organization-${uuidv7()}`,
      metadata: { source: "message-list-test", scope: "other-organization" },
      role: "user" as const,
      sequence: 1,
      sessionId: otherOrganizationSessionId as string,
    },
    {
      agentId: fixture.agentAId,
      clientRequestId: `message-list-other-user-request-${uuidv7()}`,
      content: "other user message",
      id: `message-list-other-user-${uuidv7()}`,
      metadata: { source: "message-list-test", scope: "other-user" },
      role: "user" as const,
      sequence: 1,
      sessionId: otherUserSessionId as string,
    },
  ])
})

afterAll(async () => {
  if (databaseAvailable) {
    if (userAId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userAId))
    if (userBId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userBId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverAId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverBId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationAId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationBId))
  }
  await client.end()
})

test.skipIf(!databaseAvailable)("message pages use a canonical sequence cursor without duplicates", async () => {
  if (userAId === undefined || sessionAId === undefined) return

  const first = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    limit: 2,
  })
  expect(first.success).toBe(true)
  if (!first.success) return
  expect(first.data.messages.map((message) => message.sequence)).toEqual([1, 2])
  expect(first.data.hasMore).toBe(true)
  expect(first.data.nextCursor).toEqual(expect.any(String))

  const second = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    cursor: first.data.nextCursor ?? undefined,
    limit: 2,
  })
  expect(second.success).toBe(true)
  if (!second.success) return
  expect(second.data.messages.map((message) => message.sequence)).toEqual([3, 4])
  expect(second.data.hasMore).toBe(true)
  expect(second.data.nextCursor).toEqual(expect.any(String))

  const third = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    cursor: second.data.nextCursor ?? undefined,
    limit: 2,
  })
  expect(third.success).toBe(true)
  if (!third.success) return
  expect(third.data.messages.map((message) => message.sequence)).toEqual([5])
  expect(third.data.hasMore).toBe(false)
  expect(third.data.nextCursor).toBeNull()

  const allIds = [...first.data.messages, ...second.data.messages, ...third.data.messages].map((message) => message.id)
  expect(new Set(allIds).size).toBe(allIds.length)
  expect(allIds).toHaveLength(5)
})

test.skipIf(!databaseAvailable)("message pagination exposes empty and final pages explicitly", async () => {
  if (userAId === undefined || sessionAId === undefined || emptySessionId === undefined) return

  const empty = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, emptySessionId, {
    limit: 50,
  })
  expect(empty).toMatchObject({ success: true, data: { hasMore: false, messages: [], nextCursor: null } })

  const final = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    limit: 5,
  })
  expect(final).toMatchObject({ success: true, data: { hasMore: false, nextCursor: null } })
  if (!final.success) return

  const apiRecords = final.data.messages.map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
    finalizedAt: message.finalizedAt.toISOString(),
  }))
  const response = v.safeParse(messagePageResponseSchema, {
    asOfCursor: final.data.asOfCursor,
    etag: '"message-list-test"',
    hasMore: final.data.hasMore,
    messages: apiRecords,
    nextCursor: final.data.nextCursor,
    revision: 1,
    schemaVersion: "message.v2",
  })
  expect(response.success).toBe(true)
})

test.skipIf(!databaseAvailable)("message cursors reject non-canonical and invalid values", async () => {
  if (userAId === undefined || sessionAId === undefined) return

  const invalid = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    cursor: "not-a-cursor",
    limit: 2,
  })
  expect(invalid).toMatchObject({ success: false, errorMessage: "The message list cursor is invalid." })

  const codec = messageListCursorCodecCreate()
  const canonical = codec.encode({ id: "message-list-cursor-id", sequence: 2, sessionId: sessionAId, version: 1 })
  const nonCanonical = Buffer.from(
    JSON.stringify({ id: "message-list-cursor-id", sequence: 2, sessionId: sessionAId, version: 1 }),
    "utf8",
  ).toString("base64url")
  expect(nonCanonical).not.toBe(canonical)
  const rejected = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    cursor: nonCanonical,
    limit: 2,
  })
  expect(rejected).toMatchObject({ success: false, errorMessage: "The message list cursor is invalid." })
})

test.skipIf(!databaseAvailable)("message ordering and sequence uniqueness are scoped to one session", async () => {
  if (userAId === undefined || sessionAId === undefined || siblingSessionId === undefined) return
  const selectedSessionAId = sessionAId

  const page = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, selectedSessionAId, {
    limit: 50,
  })
  expect(page.success).toBe(true)
  if (!page.success) return
  expect(page.data.messages.map((message) => message.sequence)).toEqual([1, 2, 3, 4, 5])
  expect(page.data.messages.every((message) => message.sessionId === selectedSessionAId)).toBe(true)

  let duplicateRejected = false
  try {
    await database.transaction(async (transaction) => {
      await transaction.insert(messageTable).values({
        agentId: fixture.agentAId,
        clientRequestId: `message-list-duplicate-request-${uuidv7()}`,
        content: "duplicate sequence",
        id: `message-list-duplicate-${uuidv7()}`,
        metadata: {},
        role: "user",
        sequence: 1,
        sessionId: selectedSessionAId,
      })
    })
  } catch (_error) {
    duplicateRejected = true
  }
  expect(duplicateRejected).toBe(true)

  const sibling = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, siblingSessionId, {
    limit: 50,
  })
  expect(sibling).toMatchObject({ success: true, data: { messages: [{ sequence: 1 }] } })
})

test.skipIf(!databaseAvailable)("message listing enforces user, organization, and session isolation", async () => {
  if (
    userAId === undefined ||
    userBId === undefined ||
    sessionAId === undefined ||
    otherOrganizationSessionId === undefined ||
    otherUserSessionId === undefined
  )
    return

  const wrongUser = await messageRepositoryListFinalized(database, userBId, fixture.organizationAId, sessionAId, {
    limit: 50,
  })
  expect(wrongUser).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const wrongOrganization = await messageRepositoryListFinalized(
    database,
    userAId,
    fixture.organizationBId,
    sessionAId,
    { limit: 50 },
  )
  expect(wrongOrganization).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const wrongSessionScope = await messageRepositoryListFinalized(
    database,
    userAId,
    fixture.organizationAId,
    otherUserSessionId,
    { limit: 50 },
  )
  expect(wrongSessionScope).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const otherOrganization = await messageRepositoryListFinalized(
    database,
    userAId,
    fixture.organizationAId,
    otherOrganizationSessionId,
    { limit: 50 },
  )
  expect(otherOrganization).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const page = await messageRepositoryListFinalized(database, userAId, fixture.organizationAId, sessionAId, {
    limit: 1,
  })
  expect(page.success).toBe(true)
  if (!page.success || page.data.nextCursor === null) return
  const cursorForWrongSession = await messageRepositoryListFinalized(
    database,
    userAId,
    fixture.organizationAId,
    otherUserSessionId,
    { cursor: page.data.nextCursor, limit: 50 },
  )
  expect(cursorForWrongSession).toMatchObject({ success: false, errorMessage: "The message list cursor is invalid." })
})
