import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventsAppend } from "../src/journal/actions/journalEventsAppend.js"
import { journalEventsPrune } from "../src/journal/actions/journalEventsPrune.js"
import { journalGlobalSummaryBacklogRead } from "../src/journal/actions/journalGlobalSummaryBacklogRead.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const fixturePrefix = `task21-global-replay-${crypto.randomUUID()}`
const gapUserId = `${fixturePrefix}-gap`
const emptyUserId = `${fixturePrefix}-empty`
const postPruneUserId = `${fixturePrefix}-post-prune`
const fixtureUserIds = [gapUserId, emptyUserId, postPruneUserId]
const now = new Date("2026-09-01T12:00:00.000Z")
const twelveHours = 12 * 60 * 60 * 1_000
const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: "task-21-global-replay-secret" })
if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
const cursorCodec = cursorCodecResult.data

beforeAll(async () => {
  await database.insert(applicationUserTable).values(fixtureUserIds.map((id) => ({ displayName: id, id })))
  await database.insert(journalSequenceCounterTable).values([
    { nextSequence: 4, userId: gapUserId },
    { nextSequence: 4, userId: emptyUserId },
    { nextSequence: 4, userId: postPruneUserId },
  ])
  await database.insert(journalEventTable).values([
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "run-started",
      id: `${gapUserId}-1`,
      payload: { runId: `${gapUserId}-run-1`, sessionId: `${gapUserId}-session-1` },
      sequence: 1,
      serializedBytes: 1,
      userId: gapUserId,
    },
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-completed",
      id: `${gapUserId}-2`,
      payload: {
        changePosition: 1,
        messageId: null,
        runId: `${gapUserId}-run-2`,
        sessionId: `${gapUserId}-session-2`,
        sessionRevision: 1,
      },
      sequence: 2,
      serializedBytes: 1,
      userId: gapUserId,
    },
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "run-started",
      id: `${gapUserId}-3`,
      payload: { runId: `${gapUserId}-run-3`, sessionId: `${gapUserId}-session-3` },
      sequence: 3,
      serializedBytes: 1,
      userId: gapUserId,
    },
    ...Array.from({ length: 3 }, (_, index) => {
      const sequence = index + 1
      return {
        createdAt: new Date(now.getTime() - twelveHours - 1),
        eventType: "run-started" as const,
        id: `${emptyUserId}-${sequence}`,
        payload: { runId: `${emptyUserId}-run-${sequence}`, sessionId: `${emptyUserId}-session-${sequence}` },
        sequence,
        serializedBytes: 1,
        userId: emptyUserId,
      }
    }),
    {
      createdAt: new Date(now.getTime() - 1_000),
      eventType: "run-started",
      id: `${postPruneUserId}-1`,
      payload: { runId: `${postPruneUserId}-run-1`, sessionId: `${postPruneUserId}-session-1` },
      sequence: 1,
      serializedBytes: 1,
      userId: postPruneUserId,
    },
    {
      createdAt: new Date(now.getTime() - twelveHours - 1),
      eventType: "run-started",
      id: `${postPruneUserId}-2`,
      payload: { runId: `${postPruneUserId}-run-2`, sessionId: `${postPruneUserId}-session-2` },
      sequence: 2,
      serializedBytes: 1,
      userId: postPruneUserId,
    },
    {
      createdAt: new Date(now.getTime() - twelveHours - 2),
      eventType: "run-started",
      id: `${postPruneUserId}-3`,
      payload: { runId: `${postPruneUserId}-run-3`, sessionId: `${postPruneUserId}-session-3` },
      sequence: 3,
      serializedBytes: 1,
      userId: postPruneUserId,
    },
  ])
})

afterAll(async () => {
  for (const userId of fixtureUserIds)
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

function cursorEncode(userId: string, globalSequence: number): string {
  const encoded = cursorCodec.encodeGlobalSequence?.(userId, globalSequence)
  if (encoded === undefined || !encoded.success)
    throw new Error(encoded?.errorMessage ?? "The cursor codec is unavailable.")
  return encoded.data
}

async function backlogRead(userId: string, globalSequence: number) {
  return journalGlobalSummaryBacklogRead(
    { cursorCodec, database },
    { after: cursorEncode(userId, globalSequence), userId },
  )
}

async function backlogFrames(userId: string, globalSequence: number) {
  const result = await backlogRead(userId, globalSequence)
  if (!result.success) throw new Error(result.errorMessage)
  const frames = []
  for await (const page of result.data.pages) {
    if (!page.success) throw new Error(page.errorMessage)
    frames.push(...page.data)
  }
  return { frames, result }
}

test("resets a cursor below the persisted boundary even when an older compact event remains retained", async () => {
  const pruned = await journalEventsPrune(
    {
      clock: () => now,
      database,
      limits: { maxAgeMs: twelveHours, maxCount: 100, maxSerializedBytes: 1_000_000 },
    },
    { userId: gapUserId },
  )
  expect(pruned).toMatchObject({
    data: {
      highestAllocatedSequence: 3,
      newestRetainedCompactSequence: 3,
      oldestRetainedCompactSequence: 1,
      prunedThroughSequence: 2,
    },
    success: true,
  })

  const stale = await backlogFrames(gapUserId, 0)
  expect(stale.result).toMatchObject({ data: { mode: "reset", replayUpperBound: 3 }, success: true })
  expect(stale.frames).toHaveLength(1)

  const afterGap = await backlogFrames(gapUserId, 1)
  expect(afterGap.result).toMatchObject({ data: { afterGlobalSequence: 1, mode: "reset" }, success: true })
  expect(afterGap.frames).toHaveLength(1)

  const retainedTail = await journalEventsPrune(
    {
      clock: () => now,
      database,
      limits: { maxAgeMs: twelveHours, maxCount: 1, maxSerializedBytes: 1_000_000 },
    },
    { userId: gapUserId },
  )
  expect(retainedTail).toMatchObject({
    data: { newestRetainedCompactSequence: 3, oldestRetainedCompactSequence: 3, prunedThroughSequence: 2 },
    success: true,
  })

  const beforeRetainedWindow = await backlogFrames(gapUserId, 1)
  expect(beforeRetainedWindow.result).toMatchObject({ data: { mode: "reset" }, success: true })
  const atRetainedWindow = await backlogFrames(gapUserId, 2)
  expect(atRetainedWindow.result).toMatchObject({ data: { mode: "replay" }, success: true })
  expect(atRetainedWindow.frames.map((frame) => frame.data.globalSequence)).toEqual([3])
})

test("resets stale empty-window baselines but accepts the allocated high-water mark", async () => {
  const pruned = await journalEventsPrune(
    {
      clock: () => now,
      database,
      limits: { maxAgeMs: twelveHours, maxCount: 100, maxSerializedBytes: 1_000_000 },
    },
    { userId: emptyUserId },
  )
  expect(pruned).toMatchObject({
    data: {
      highestAllocatedSequence: 3,
      newestRetainedCompactSequence: null,
      oldestRetainedCompactSequence: null,
      prunedThroughSequence: 3,
    },
    success: true,
  })

  const current = await backlogFrames(emptyUserId, 3)
  expect(current.result).toMatchObject({
    data: { afterGlobalSequence: 3, mode: "replay", replayUpperBound: 3 },
    success: true,
  })
  expect(current.frames).toEqual([])

  const stale = await backlogFrames(emptyUserId, 2)
  expect(stale.result).toMatchObject({ data: { mode: "reset", replayUpperBound: 3 }, success: true })
  expect(stale.frames).toHaveLength(1)
  const [reset] = stale.frames
  if (reset === undefined) return
  expect(reset.data).toEqual({
    asOfGlobalSequence: 3,
    eventType: "reset",
    globalSequence: 3,
    id: reset.id,
    reason: "cursor-expired",
  })
})

test("resets a cursor below the persisted boundary when an older compact event remains retained", async () => {
  const pruned = await journalEventsPrune(
    {
      clock: () => now,
      database,
      limits: { maxAgeMs: twelveHours * 2, maxCount: 1, maxSerializedBytes: 1_000_000 },
    },
    { userId: postPruneUserId },
  )
  expect(pruned).toMatchObject({
    data: {
      highestAllocatedSequence: 3,
      newestRetainedCompactSequence: 1,
      oldestRetainedCompactSequence: 1,
      prunedEventCount: 2,
      prunedThroughSequence: 3,
    },
    success: true,
  })

  const appended = await journalEventsAppend(
    database,
    {
      eventType: "run-started",
      payload: { runId: `${postPruneUserId}-run-4`, sessionId: `${postPruneUserId}-session-4` },
      resource: { resourceId: `${postPruneUserId}-run-4`, resourceType: "run" },
    },
    async () => createResult([postPruneUserId]),
  )
  expect(appended).toMatchObject({ data: { events: [{ sequence: 4 }] }, success: true })

  const stale = await backlogFrames(postPruneUserId, 1)
  expect(stale.result).toMatchObject({ data: { mode: "reset", replayUpperBound: 4 }, success: true })
  expect(stale.frames).toHaveLength(1)
  expect(stale.frames[0]?.data).toMatchObject({ eventType: "reset", globalSequence: 4 })
})
