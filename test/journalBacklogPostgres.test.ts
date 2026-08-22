import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../src/journal/db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixturePrefix = `task6-backlog-${uuidv7()}`
const userId = `${fixturePrefix}-user`
const otherUserId = `${fixturePrefix}-other`
const largeUserId = `${fixturePrefix}-large`
const fixtureUserIds = [userId, otherUserId, largeUserId]
const codecResult = journalCursorCodecCreate({
  randomBytes: (size) => randomBytes(size),
  secret: `${fixturePrefix}-secret`,
})

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values(fixtureUserIds.map((id) => ({ displayName: id, id })))
  await database.insert(journalSequenceCounterTable).values({ nextSequence: 6, userId })
  await database.insert(journalReplayBoundaryTable).values({ prunedThroughSequence: 1, userId })
  await database.insert(journalSequenceCounterTable).values({ nextSequence: 1_101, userId: largeUserId })
  await database.insert(journalEventTable).values(
    Array.from({ length: 1_100 }, (_, index) => {
      const sequence = index + 1
      return {
        eventType: "invalidate" as const,
        id: uuidv7(),
        payload: { resourceId: `resource-${sequence}`, resourceType: "session" as const, revision: sequence },
        sequence,
        userId: largeUserId,
      }
    }),
  )
  await database.insert(journalEventTable).values([
    {
      eventType: "invalidate",
      id: uuidv7(),
      payload: { resourceId: "session-2", resourceType: "session", revision: 2 },
      sequence: 2,
      userId,
    },
    {
      eventType: "run-completed",
      id: uuidv7(),
      payload: {
        messageId: null,
        runId: "run-5",
        sessionId: "session-5",
        sessionRevision: 5,
      },
      sequence: 5,
      userId,
    },
  ])
})

afterAll(async () => {
  if (databaseAvailable) {
    for (const fixtureUserId of fixtureUserIds)
      await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixtureUserId))
  }
  await client.end()
})

function backlogRead(input: { after?: unknown; lastEventId?: unknown; userId: unknown }) {
  if (!codecResult.success) throw new Error(codecResult.errorMessage)
  return journalBacklogRead({ cursorCodec: codecResult.data, database }, input)
}

test.skipIf(!databaseAvailable)("reads durable events in sequence order without inferring gaps", async () => {
  const cursor = codecResult.success ? codecResult.data.encode(userId, 1) : undefined
  expect(cursor?.success).toBe(true)
  if (cursor === undefined || !cursor.success) return

  const result = await backlogRead({ after: cursor.data, userId })
  expect(result).toMatchObject({ data: { mode: "replay", afterSequence: 1 }, success: true })
  if (!result.success) return
  const events: StreamSseFrame[] = []
  for await (const page of result.data.pages) {
    expect(page.success).toBe(true)
    if (page.success) events.push(...page.data)
  }
  expect(events.map((event) => event.data.sequence)).toEqual([2, 5])
  expect(events.map((event) => event.event)).toEqual(["invalidate", "run-completed"])
})

test.skipIf(!databaseAvailable)("uses Last-Event-ID before after", async () => {
  if (!codecResult.success) return
  const headerCursor = codecResult.data.encode(userId, 5)
  const queryCursor = codecResult.data.encode(userId, 1)
  expect(headerCursor.success).toBe(true)
  expect(queryCursor.success).toBe(true)
  if (!headerCursor.success || !queryCursor.success) return

  const result = await backlogRead({ after: queryCursor.data, lastEventId: headerCursor.data, userId })
  expect(result).toMatchObject({
    data: { mode: "replay", selectedCursor: headerCursor.data, replayUpperBound: 5 },
    success: true,
  })
  if (!result.success) return
  for await (const page of result.data.pages) expect(page.success && page.data).toEqual([])
})

test.skipIf(!databaseAvailable)("streams a large durable backlog in bounded sequence pages", async () => {
  const result = await backlogRead({ userId: largeUserId })
  expect(result).toMatchObject({ data: { mode: "replay", replayUpperBound: 1_100 }, success: true })
  if (!result.success) return

  let eventCount = 0
  let maximumPageSize = 0
  let lastSequence = 0
  for await (const page of result.data.pages) {
    expect(page.success).toBe(true)
    if (!page.success) continue
    maximumPageSize = Math.max(maximumPageSize, page.data.length)
    for (const event of page.data) {
      expect(event.data.sequence).toBeGreaterThan(lastSequence)
      lastSequence = event.data.sequence
      eventCount += 1
    }
  }

  expect(eventCount).toBe(1_100)
  expect(maximumPageSize).toBeLessThanOrEqual(128)
})

test.skipIf(!databaseAvailable)("returns one reset frame for an unrecoverable cursor", async () => {
  if (!codecResult.success) return
  const expired = codecResult.data.encode(userId, 0)
  expect(expired.success).toBe(true)
  if (!expired.success) return

  const result = await backlogRead({ lastEventId: expired.data, userId })
  expect(result).toMatchObject({ data: { mode: "reset", replayUpperBound: 5 }, success: true })
  if (!result.success) return
  const pages: StreamSseFrame[] = []
  for await (const page of result.data.pages) if (page.success) pages.push(...page.data)
  expect(pages).toHaveLength(1)
  const [reset] = pages
  expect(reset?.data).toMatchObject({ asOfSequence: 5, eventType: "reset", reason: "cursor-expired", sequence: 5 })
})

test.skipIf(!databaseAvailable)("rejects malformed, cross-user, and unauthenticated cursors", async () => {
  const malformed = await backlogRead({ lastEventId: "not-a-cursor", userId })
  expect(malformed).toMatchObject({ code: "cursor_invalid", success: false })

  if (!codecResult.success) return
  const otherUserCursor = codecResult.data.encode(userId, 1)
  expect(otherUserCursor.success).toBe(true)
  if (!otherUserCursor.success) return

  const crossUser = await backlogRead({ lastEventId: otherUserCursor.data, userId: otherUserId })
  expect(crossUser).toMatchObject({ code: "cursor_owner_mismatch", success: false })

  const unknownUser = await backlogRead({ userId: `${fixturePrefix}-missing` })
  expect(unknownUser).toMatchObject({ code: "authenticated_user_invalid", success: false })
})
