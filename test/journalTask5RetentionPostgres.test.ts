import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as v from "valibot"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalEventsAppend } from "../src/journal/actions/journalEventsAppend.js"
import { journalEventsPrune } from "../src/journal/actions/journalEventsPrune.js"
import { journalEventsPruneDefaultLimits } from "../src/journal/actions/journalEventsPruneDefaultLimits.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../src/journal/db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import type { JournalEventsPruneLimits } from "../src/journal/schema/journalEventsPruneLimitsSchema.js"
import { journalEventsPruneLimitsSchema } from "../src/journal/schema/journalEventsPruneLimitsSchema.js"
import type { JournalJsonValue } from "../src/journal/schema/journalJsonValueSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixturePrefix = `task5-retention-${uuidv7()}`
const ageUserId = `${fixturePrefix}-age`
const countUserId = `${fixturePrefix}-count`
const sizeUserId = `${fixturePrefix}-size`
const isolationUserAId = `${fixturePrefix}-isolation-a`
const isolationUserBId = `${fixturePrefix}-isolation-b`
const cursorUserId = `${fixturePrefix}-cursor`
const batchingUserId = `${fixturePrefix}-batching`
const fixtureUserIds = [
  ageUserId,
  countUserId,
  sizeUserId,
  isolationUserAId,
  isolationUserBId,
  cursorUserId,
  batchingUserId,
]
const now = new Date("2026-08-22T12:00:00.000Z")
const twelveHours = 12 * 60 * 60 * 1_000

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values(fixtureUserIds.map((id) => ({ displayName: id, id })))
})

afterAll(async () => {
  if (databaseAvailable) {
    for (const userId of fixtureUserIds) {
      await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
    }
  }
  await client.end()
})

type FixtureEvent = {
  createdAt: Date
  eventType: string
  payload: JournalJsonValue
  sequence: number
}

async function fixtureEventsInsert(userId: string, events: readonly FixtureEvent[]): Promise<void> {
  const highestSequence = Math.max(...events.map((event) => event.sequence), 0)
  await database.insert(journalSequenceCounterTable).values({
    nextSequence: highestSequence + 1,
    userId,
  })
  await database.insert(journalEventTable).values(
    events.map((event) => ({
      createdAt: event.createdAt,
      eventType: event.eventType,
      id: uuidv7(),
      payload: event.payload,
      sequence: event.sequence,
      userId,
    })),
  )
}

function fixtureLimits(overrides: Partial<JournalEventsPruneLimits> = {}): JournalEventsPruneLimits {
  return {
    maxAgeMs: twelveHours,
    maxCount: 100,
    maxSerializedBytes: 1_000_000,
    ...overrides,
  }
}

function fixturePrune(userId: string, limits: JournalEventsPruneLimits, afterSequence?: number) {
  return journalEventsPrune({ clock: () => now, database, limits }, { afterSequence, userId })
}

async function fixtureSequences(userId: string) {
  return database
    .select({ eventType: journalEventTable.eventType, sequence: journalEventTable.sequence })
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, userId))
    .orderBy(asc(journalEventTable.sequence))
}

async function fixtureCompactSerializedBytes(userId: string) {
  return database
    .select({ sequence: journalEventTable.sequence, serializedBytes: journalEventTable.serializedBytes })
    .from(journalEventTable)
    .where(
      and(
        eq(journalEventTable.userId, userId),
        inArray(journalEventTable.eventType, [
          "invalidate",
          "run-completed",
          "run-failed",
          "run-cancelled",
          "run-interrupted",
        ]),
      ),
    )
    .orderBy(asc(journalEventTable.sequence))
}

test.skipIf(!databaseAvailable)("prunes compact events at the twelve-hour age boundary", async () => {
  await fixtureEventsInsert(ageUserId, [
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-completed",
      payload: { runId: "old" },
      sequence: 1,
    },
    {
      createdAt: new Date(now.getTime() - twelveHours),
      eventType: "invalidate",
      payload: { resourceId: "boundary" },
      sequence: 2,
    },
    {
      createdAt: new Date(now.getTime() - 24 * twelveHours),
      eventType: "delta",
      payload: { delta: "active" },
      sequence: 3,
    },
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "run-failed",
      payload: { runId: "recent" },
      sequence: 4,
    },
  ])

  const result = await fixturePrune(ageUserId, fixtureLimits())

  expect(result).toMatchObject({
    success: true,
    data: {
      oldestPrunedSequence: 1,
      prunedEventCount: 2,
      prunedThroughSequence: 2,
    },
  })
  expect(await fixtureSequences(ageUserId)).toEqual([
    { eventType: "delta", sequence: 3 },
    { eventType: "run-failed", sequence: 4 },
  ])
})

test.skipIf(!databaseAvailable)(
  "prunes the oldest compact events at the count boundary without reusing sequences",
  async () => {
    await fixtureEventsInsert(
      countUserId,
      Array.from({ length: 4 }, (_, index) => ({
        createdAt: new Date(now.getTime() - (4 - index) * 1_000),
        eventType: "invalidate",
        payload: { index },
        sequence: index + 1,
      })),
    )

    const result = await fixturePrune(countUserId, fixtureLimits({ maxAgeMs: twelveHours * 2, maxCount: 2 }))

    expect(result).toMatchObject({
      success: true,
      data: {
        compactEventCountAfter: 2,
        compactEventCountBefore: 4,
        prunedEventCount: 2,
      },
    })
    const appended = await journalEventsAppend(
      database,
      {
        eventType: "invalidate",
        payload: { index: 4 },
        resource: { resourceId: countUserId, resourceType: "test-resource" },
      },
      async () => createResult([countUserId]),
    )
    expect(appended).toMatchObject({ success: true, data: { events: [{ sequence: 5 }] } })
    expect((await fixtureSequences(countUserId)).map((event) => event.sequence)).toEqual([3, 4, 5])
  },
)

test.skipIf(!databaseAvailable)(
  "prunes the oldest compact events at the serialized journal-event-size boundary",
  async () => {
    const payloads = ["a", "bb", "ccc"] as const
    await fixtureEventsInsert(
      sizeUserId,
      payloads.map((payload, index) => ({
        createdAt: new Date(now.getTime() - (payloads.length - index) * 1_000),
        eventType: "run-completed",
        payload,
        sequence: index + 1,
      })),
    )
    await database.insert(journalEventTable).values({
      createdAt: new Date(now.getTime() - 24 * twelveHours),
      eventType: "delta",
      id: uuidv7(),
      payload: { delta: "active", padding: "this is not part of compact retention" },
      sequence: 4,
      userId: sizeUserId,
    })

    const compactEventsBefore = await fixtureCompactSerializedBytes(sizeUserId)
    const retainedSerializedBytes = compactEventsBefore.find((event) => event.sequence === 3)?.serializedBytes
    expect(retainedSerializedBytes).toBeDefined()
    if (retainedSerializedBytes === undefined) return
    expect(compactEventsBefore[0]?.serializedBytes).toBeGreaterThan(
      new TextEncoder().encode(JSON.stringify("a") ?? "null").byteLength,
    )

    const result = await fixturePrune(
      sizeUserId,
      fixtureLimits({
        maxAgeMs: twelveHours * 2,
        maxSerializedBytes: retainedSerializedBytes,
      }),
    )

    const prunedSerializedBytes = compactEventsBefore
      .filter((event) => event.sequence !== 3)
      .reduce((total, event) => total + event.serializedBytes, 0)
    expect(result).toMatchObject({
      success: true,
      data: {
        compactSerializedBytesAfter: retainedSerializedBytes,
        prunedEventCount: 2,
        prunedSerializedBytes,
      },
    })
    expect(await fixtureSequences(sizeUserId)).toEqual([
      { eventType: "run-completed", sequence: 3 },
      { eventType: "delta", sequence: 4 },
    ])
  },
)

test.skipIf(!databaseAvailable)("isolates pruning by application user and preserves active deltas", async () => {
  await fixtureEventsInsert(isolationUserAId, [
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-cancelled",
      payload: { runId: "a-old" },
      sequence: 1,
    },
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "delta",
      payload: { delta: "a-active" },
      sequence: 2,
    },
  ])
  await fixtureEventsInsert(isolationUserBId, [
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-cancelled",
      payload: { runId: "b-old" },
      sequence: 1,
    },
  ])

  const result = await fixturePrune(isolationUserAId, fixtureLimits())

  expect(result).toMatchObject({ success: true, data: { prunedEventCount: 1, userId: isolationUserAId } })
  expect(await fixtureSequences(isolationUserAId)).toEqual([{ eventType: "delta", sequence: 2 }])
  expect(await fixtureSequences(isolationUserBId)).toEqual([{ eventType: "run-cancelled", sequence: 1 }])
  expect(
    await database
      .select({ userId: journalReplayBoundaryTable.userId, sequence: journalReplayBoundaryTable.prunedThroughSequence })
      .from(journalReplayBoundaryTable)
      .where(inArray(journalReplayBoundaryTable.userId, [isolationUserAId, isolationUserBId]))
      .orderBy(asc(journalReplayBoundaryTable.userId)),
  ).toEqual([{ sequence: 1, userId: isolationUserAId }])
})

test.skipIf(!databaseAvailable)("reports cursor reset recoverability when a compact cursor is pruned", async () => {
  await fixtureEventsInsert(cursorUserId, [
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-interrupted",
      payload: { runId: "expired" },
      sequence: 1,
    },
    {
      createdAt: new Date(now.getTime() - 24 * twelveHours),
      eventType: "delta",
      payload: { delta: "gap is valid" },
      sequence: 2,
    },
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "run-completed",
      payload: { runId: "retained" },
      sequence: 3,
    },
  ])
  await database
    .delete(journalEventTable)
    .where(and(eq(journalEventTable.userId, cursorUserId), eq(journalEventTable.sequence, 2)))

  const prunedCursor = await fixturePrune(cursorUserId, fixtureLimits(), 1)
  expect(prunedCursor).toMatchObject({
    success: true,
    data: {
      cursorRecoverability: { afterSequence: 1, reason: "gap", recoverable: true },
      oldestPrunedSequence: 1,
      prunedThroughSequence: 1,
    },
  })

  const earlierCursor = await fixturePrune(cursorUserId, fixtureLimits(), 0)
  expect(earlierCursor).toMatchObject({
    success: true,
    data: {
      cursorRecoverability: { afterSequence: 0, reason: "pruned", recoverable: false },
    },
  })

  const compactedGap = await fixturePrune(cursorUserId, fixtureLimits(), 2)
  expect(compactedGap).toMatchObject({
    success: true,
    data: {
      cursorRecoverability: { afterSequence: 2, reason: "gap", recoverable: true },
    },
  })
})

test.skipIf(!databaseAvailable)("persists the replay boundary across repeated pruning invocations", async () => {
  const repeatedUserId = `${fixturePrefix}-repeated`
  await database.insert(applicationUserTable).values({ displayName: repeatedUserId, id: repeatedUserId })
  try {
    await fixtureEventsInsert(repeatedUserId, [
      {
        createdAt: new Date(now.getTime() - twelveHours - 1),
        eventType: "run-completed",
        payload: { runId: "repeated-old" },
        sequence: 1,
      },
      {
        createdAt: new Date(now.getTime() - 1_000),
        eventType: "invalidate",
        payload: { resourceId: "repeated-new" },
        sequence: 2,
      },
    ])

    const first = await fixturePrune(repeatedUserId, fixtureLimits(), 1)
    const second = await fixturePrune(repeatedUserId, fixtureLimits(), 1)

    expect(first).toMatchObject({ success: true, data: { prunedEventCount: 1, prunedThroughSequence: 1 } })
    expect(second).toMatchObject({
      success: true,
      data: {
        cursorRecoverability: { reason: "gap", recoverable: true },
        prunedEventCount: 0,
        prunedThroughSequence: 1,
      },
    })
    expect(
      await database
        .select({ sequence: journalReplayBoundaryTable.prunedThroughSequence })
        .from(journalReplayBoundaryTable)
        .where(eq(journalReplayBoundaryTable.userId, repeatedUserId)),
    ).toEqual([{ sequence: 1 }])
  } finally {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, repeatedUserId))
  }
})

test.skipIf(!databaseAvailable)("prunes compact events in bounded batches", async () => {
  const events = Array.from({ length: 2_005 }, (_, index) => ({
    createdAt: new Date(now.getTime() - (2_005 - index) * 1_000),
    eventType: "invalidate",
    payload: { index },
    sequence: index + 1,
  }))
  await fixtureEventsInsert(batchingUserId, events)

  const result = await fixturePrune(
    batchingUserId,
    fixtureLimits({ maxAgeMs: twelveHours * 2, maxCount: 0, maxSerializedBytes: 1_000_000_000 }),
  )

  expect(result).toMatchObject({
    success: true,
    data: {
      compactEventCountAfter: 0,
      prunedEventCount: events.length,
      pruneBatchCount: 3,
      prunedThroughSequence: events.length,
    },
  })
})

test.skipIf(!databaseAvailable)("keeps the configured twelve-hour, count, and 512 MiB limits explicit", () => {
  expect(journalEventsPruneDefaultLimits).toEqual({
    maxAgeMs: twelveHours,
    maxCount: 500_000,
    maxSerializedBytes: 512 * 1024 * 1024,
  })
  expect(
    v.safeParse(journalEventsPruneLimitsSchema, {
      maxAgeMs: twelveHours,
      maxCount: 500_000,
      maxSerializedBytes: 512 * 1024 * 1024,
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(journalEventsPruneLimitsSchema, {
      maxAgeMs: twelveHours,
      maxCount: 500_000,
      maxPayloadBytes: 512 * 1024 * 1024,
    }).success,
  ).toBe(false)
})
