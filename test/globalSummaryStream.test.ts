import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult, createResultErrorCode } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalGlobalSummaryBacklogRead } from "../src/journal/actions/journalGlobalSummaryBacklogRead.js"
import { journalGlobalSummaryEventFrameCreate } from "../src/journal/actions/journalGlobalSummaryEventFrameCreate.js"
import { journalGlobalSummaryPostCommitPublishCreate } from "../src/journal/actions/journalGlobalSummaryPostCommitPublishCreate.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../src/journal/db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { globalSummarySseFrameSchema } from "../src/stream/api/globalSummarySseFrameSchema.js"
import { streamSseFrameSerialize } from "../src/stream/api/streamSseFrameSerialize.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const userId = `global-summary-${crypto.randomUUID()}`
const cursorCodec = {
  encode: (_journalId: unknown, sequence: unknown) => createResult(`global-cursor-${String(sequence)}`),
  encodeGlobalSequence: (_journalId: unknown, globalSequence: unknown) =>
    createResult(`global-cursor-${String(globalSequence)}`),
  validate: (cursor: unknown, journalId: unknown) => {
    const prefix = `global-cursor-`
    if (typeof cursor !== "string" || !cursor.startsWith(prefix))
      return createResultErrorCode("globalCursorValidate", "The global cursor is invalid.", "cursor_invalid")
    if (journalId !== userId)
      return createResultErrorCode(
        "globalCursorValidate",
        "The global cursor belongs to another user.",
        "cursor_owner_mismatch",
      )
    return createResult({ journalId, sequence: Number(cursor.slice(prefix.length)), version: 1 })
  },
  validateGlobalSequence: (cursor: unknown, journalId: unknown) => {
    const prefix = "global-cursor-"
    if (typeof cursor !== "string" || !cursor.startsWith(prefix))
      return createResultErrorCode("globalCursorValidate", "The global cursor is invalid.", "cursor_invalid")
    if (journalId !== userId)
      return createResultErrorCode(
        "globalCursorValidate",
        "The global cursor belongs to another user.",
        "cursor_owner_mismatch",
      )
    return createResult({ journalId, globalSequence: Number(cursor.slice(prefix.length)), version: 1 })
  },
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: userId, id: userId })
  await database.insert(journalSequenceCounterTable).values({ nextSequence: 5, userId })
  await database.insert(journalReplayBoundaryTable).values({ prunedThroughSequence: 0, userId })
  await database.insert(journalEventTable).values([
    {
      eventType: "delta",
      id: `${userId}-delta`,
      payload: { delta: "secret", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" },
      sequence: 1,
      serializedBytes: 1,
      userId,
    },
    {
      eventType: "invalidate",
      id: `${userId}-invalidate`,
      payload: { resourceId: "session-1", resourceType: "session", revision: 2 },
      sequence: 2,
      serializedBytes: 1,
      userId,
    },
    {
      eventType: "provider-event",
      id: `${userId}-provider`,
      payload: { provider: "secret-provider" },
      sequence: 3,
      serializedBytes: 1,
      userId,
    },
    {
      eventType: "run-started",
      id: `${userId}-started`,
      payload: { runId: "run-1", sessionId: "session-1" },
      sequence: 4,
      serializedBytes: 1,
      userId,
    },
  ])
})

afterAll(async () => {
  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

test("creates a global lifecycle frame keyed by globalSequence", () => {
  const result = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
    eventType: "run-completed",
    payload: { changePosition: 5, messageId: null, runId: "run-1", sessionId: "session-1", sessionRevision: 3 },
    sequence: 7,
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.data).toEqual({
    changePosition: 5,
    eventType: "run-completed",
    globalSequence: 7,
    id: "global-cursor-7",
    messageId: null,
    runId: "run-1",
    sessionId: "session-1",
    sessionRevision: 3,
  })
  expect(result.data.data).not.toHaveProperty("sequence")
  expect(result.data.data).not.toHaveProperty("delta")
  expect(v.safeParse(globalSummarySseFrameSchema, result.data).success).toBe(true)
})

test("encodes global cursors with globalSequence claims", () => {
  const created = journalCursorCodecCreate({ randomBytes, secret: "global-summary-cursor-secret" })
  expect(created.success).toBe(true)
  if (!created.success) return

  const encoded = created.data.encodeGlobalSequence?.(userId, 12)
  expect(encoded?.success).toBe(true)
  if (encoded === undefined || !encoded.success) return
  expect(encoded.data.startsWith("g1.")).toBe(true)

  expect(created.data.decodeGlobalSequence?.(encoded.data)).toMatchObject({
    data: { globalSequence: 12, journalId: userId, version: 1 },
    success: true,
  })
  expect(created.data.decode(encoded.data).success).toBe(false)
  expect(created.data.validateGlobalSequence?.(encoded.data, "other-user")).toMatchObject({
    code: "cursor_owner_mismatch",
    success: false,
  })
})

test("rejects delta, transcript, tool, and provider fields from global frames", () => {
  const delta = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
    eventType: "delta",
    payload: { delta: "secret", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" },
    sequence: 1,
  })
  expect(delta.success).toBe(false)

  const leaked = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
    eventType: "run-started",
    payload: { provider: "secret-provider", runId: "run-1", sessionId: "session-1" },
    sequence: 2,
  })
  expect(leaked.success).toBe(false)

  for (const eventType of ["thinking", "tool", "provider-event", "generic-delta"]) {
    const rejected = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
      eventType,
      payload: { delta: "secret", provider: "secret-provider" },
      sequence: 2,
    } as never)
    expect(rejected.success).toBe(false)
  }
})

test("bounds global summary payloads before the complete-frame limit", () => {
  const oversizedSummary = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
    eventType: "input-needed",
    payload: {
      requestId: "request-1",
      runId: "run-1",
      sessionId: "session-1",
      sessionRevision: 1,
      summary: "x".repeat(4_097),
    },
    sequence: 8,
  })
  expect(oversizedSummary.success).toBe(false)

  const valid = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encode }, userId, {
    eventType: "input-needed",
    payload: { requestId: "request-1", runId: "run-1", sessionId: "session-1", sessionRevision: 1 },
    sequence: 8,
  })
  expect(valid.success).toBe(true)
  if (valid.success)
    expect(new TextEncoder().encode(streamSseFrameSerialize(valid.data)).byteLength).toBeLessThan(128 * 1024)
})

test("replays only permitted global summaries in global sequence order", async () => {
  const result = await journalGlobalSummaryBacklogRead({ cursorCodec, database }, { userId })
  expect(result).toMatchObject({ data: { afterGlobalSequence: 0, replayUpperBound: 4, mode: "replay" }, success: true })
  if (!result.success) return

  const frames = []
  for await (const page of result.data.pages) {
    expect(page.success).toBe(true)
    if (page.success) frames.push(...page.data)
  }
  expect(frames.map((frame) => frame.data.globalSequence)).toEqual([2, 4])
  expect(frames.every((frame) => !Object.hasOwn(frame.data, "sequence"))).toBe(true)
})

test("replays and resets with authenticated globalSequence cursors", async () => {
  const created = journalCursorCodecCreate({ randomBytes, secret: "global-summary-backlog-secret" })
  expect(created.success).toBe(true)
  if (!created.success) return

  const after = created.data.encodeGlobalSequence?.(userId, 2)
  expect(after?.success).toBe(true)
  if (after === undefined || !after.success) return

  const replay = await journalGlobalSummaryBacklogRead(
    { cursorCodec: created.data, database },
    { after: after.data, userId },
  )
  expect(replay).toMatchObject({ data: { afterGlobalSequence: 2, mode: "replay" }, success: true })
  if (!replay.success) return
  const replayFrames = []
  for await (const page of replay.data.pages) if (page.success) replayFrames.push(...page.data)
  expect(replayFrames.map((frame) => frame.data.globalSequence)).toEqual([4])

  const future = created.data.encodeGlobalSequence?.(userId, 99)
  expect(future?.success).toBe(true)
  if (future === undefined || !future.success) return
  const reset = await journalGlobalSummaryBacklogRead(
    { cursorCodec: created.data, database },
    { lastEventId: future.data, userId },
  )
  expect(reset).toMatchObject({ data: { mode: "reset", replayUpperBound: 4 }, success: true })
  if (!reset.success) return
  for await (const page of reset.data.pages) {
    if (!page.success) continue
    expect(page.data).toHaveLength(1)
    const [frame] = page.data
    expect(frame?.data).toMatchObject({ eventType: "reset", globalSequence: 4 })
    if (frame !== undefined) expect(created.data.decodeGlobalSequence?.(frame.id)).toMatchObject({ success: true })
  }
})

test("publishes lifecycle summaries but never publishes deltas", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const frames: unknown[] = []
  const unsubscribe = subscription.globalSummarySubscribe(userId, (event) => frames.push(event))
  const publish = journalGlobalSummaryPostCommitPublishCreate({ cursorCodec, liveSubscription: subscription })

  const result = await publish([
    {
      createdAt: new Date(),
      eventType: "delta",
      id: `${userId}-published-delta`,
      payload: { delta: "secret", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" },
      sequence: 5,
      serializedBytes: 1,
      userId,
    },
    {
      createdAt: new Date(),
      eventType: "run-started",
      id: `${userId}-published-started`,
      payload: { runId: "run-1", sessionId: "session-1" },
      sequence: 6,
      serializedBytes: 1,
      userId,
    },
  ] as never)

  expect(result.success).toBe(true)
  expect(frames).toHaveLength(1)
  expect((frames[0] as { data: { globalSequence: number } }).data.globalSequence).toBe(6)
  unsubscribe()
})
