import { expect, test } from "bun:test"
import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiEventsRoutesAdd } from "../src/events/api/apiEventsRoutesAdd.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import { journalGlobalSummaryEventFrameCreate } from "../src/journal/actions/journalGlobalSummaryEventFrameCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"

const userId = "global-events-user"
const cursorCodec = {
  encode: (_journalId: unknown, sequence: unknown) => createResult(`journal-cursor-${String(sequence)}`),
  encodeGlobalSequence: (_journalId: unknown, globalSequence: unknown) =>
    createResult(`global-cursor-${String(globalSequence)}`),
  validate: (cursor: unknown, journalId: unknown) => {
    if (journalId !== userId || typeof cursor !== "string" || !cursor.startsWith("journal-cursor-"))
      return createResultErrorCode("globalCursorValidate", "The global cursor is invalid.", "cursor_invalid")
    return createResult({ journalId: userId, sequence: Number(cursor.slice("journal-cursor-".length)), version: 1 })
  },
  validateGlobalSequence: (cursor: unknown, journalId: unknown) => {
    if (journalId !== userId || typeof cursor !== "string" || !cursor.startsWith("global-cursor-"))
      return createResultErrorCode("globalCursorValidate", "The global cursor is invalid.", "cursor_invalid")
    return createResult({
      globalSequence: Number(cursor.slice("global-cursor-".length)),
      journalId: userId,
      version: 1,
    })
  },
}

class TestScheduler {
  currentTime = 0
  private nextTimerId = 1
  private readonly timers = new Map<
    number,
    { callback: () => void; dueAt: number; intervalMs: number; repeating: boolean }
  >()

  clearInterval = (handle: unknown): void => {
    if (typeof handle === "number") this.timers.delete(handle)
  }

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === "number") this.timers.delete(handle)
  }

  setInterval = (callback: () => void, intervalMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, { callback, dueAt: this.currentTime + intervalMs, intervalMs, repeating: true })
    return id
  }

  setTimeout = (callback: () => void, timeoutMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, { callback, dueAt: this.currentTime + timeoutMs, intervalMs: timeoutMs, repeating: false })
    return id
  }
}

function globalFrame(sequence: number): GlobalSummarySseFrame {
  const result = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encodeGlobalSequence }, userId, {
    eventType: "run-started",
    payload: { runId: "run-1", sessionId: "session-1" },
    sequence,
  })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

function backlogPages(
  ...pages: readonly GlobalSummarySseFrame[][]
): AsyncIterable<Result<readonly GlobalSummarySseFrame[]>> {
  return (async function* () {
    for (const page of pages) yield createResult(page)
  })()
}

function appCreate(backlogRead: Parameters<typeof apiEventsRoutesAdd>[1]["backlogRead"], scheduler: TestScheduler) {
  const app = new Hono<AppEnvironment>()
  const api = new Hono<AppEnvironment>()
  const liveSubscription = streamLiveSubscriptionCreate()
  const configuration = {
    authMode: "oidc" as const,
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "test" as const,
    publicOrigin: "https://global-events.test/",
  }
  app.use(
    "/api/*",
    authenticationMiddleware(configuration, {} as never, {
      identitySessionLoad: async () =>
        createResult({
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          id: "identity-session",
          lastUsedAt: null,
          revokedAt: null,
          tokenHash: "token-hash",
          userId,
        } as never),
    }),
  )
  apiEventsRoutesAdd(api, {
    backlogRead,
    connectionWriterCreate: streamSseConnectionWriterCreate,
    cursorCodec: cursorCodec as never,
    globalSummaryLiveSubscription: liveSubscription,
    metricsCollector: metricsCollectorCreate(),
    now: () => scheduler.currentTime,
    scheduler,
  })
  app.route("/api", api)
  return { app, liveSubscription }
}

function parseFrame(chunk: Uint8Array): { data: Record<string, unknown>; event: string; id: string } {
  const text = new TextDecoder().decode(chunk)
  const id = text.match(/^id: ([^\n]+)/m)?.[1] ?? ""
  const event = text.match(/^event: ([^\n]+)/m)?.[1] ?? ""
  const data = text.match(/^data: ([^\n]+)/m)?.[1] ?? "{}"
  return { data: JSON.parse(data) as Record<string, unknown>, event, id }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

test("replays global summaries in order", async () => {
  const scheduler = new TestScheduler()
  const first = globalFrame(1)
  const { app, liveSubscription } = appCreate(
    async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "replay" as const,
        pages: backlogPages([first]),
        replayUpperBound: 1,
        selectedCursor: undefined,
      }),
    scheduler,
  )
  const response = await app.request("https://global-events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  liveSubscription.globalSummaryPublish(userId, globalFrame(2))
  const received: Array<ReturnType<typeof parseFrame>> = []
  while (received.length < 2) {
    const next = await reader.read()
    expect(next.done).toBe(false)
    if (next.done || next.value === undefined) break
    received.push(parseFrame(next.value))
  }
  expect(received.map((frame) => frame.data.globalSequence)).toEqual([1, 2])
  expect(received.every((frame) => !Object.hasOwn(frame.data, "sequence"))).toBe(true)
  await reader.cancel()
})

test("rejects a non-summary publication injected into the global channel", async () => {
  const scheduler = new TestScheduler()
  const { app, liveSubscription } = appCreate(
    async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "replay" as const,
        pages: backlogPages(),
        replayUpperBound: 0,
        selectedCursor: undefined,
      }),
    scheduler,
  )
  const response = await app.request("https://global-events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  liveSubscription.globalSummaryPublish(userId, { data: {}, event: "delta", id: "invalid" } as never)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(1)
  await reader.cancel().catch(() => undefined)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("rejects an expired global cursor before returning a reset stream", async () => {
  const scheduler = new TestScheduler()
  const reset = journalGlobalSummaryEventFrameCreate({ cursorEncode: cursorCodec.encodeGlobalSequence }, userId, {
    eventType: "reset",
    payload: { asOfGlobalSequence: 4, reason: "cursor-expired" },
    sequence: 4,
  })
  expect(reset.success).toBe(true)
  if (!reset.success) return
  const { app } = appCreate(
    async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "reset" as const,
        pages: backlogPages([reset.data]),
        replayUpperBound: 4,
        selectedCursor: "expired",
      }),
    scheduler,
  )
  const response = await app.request("https://global-events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": "global-cursor-0" },
  })
  expect(response.status).toBe(400)

  const invalid = await app.request("https://global-events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": "not-a-global-cursor" },
  })
  expect(invalid.status).toBe(400)
})

test("drops a global summary payload that exceeds the frame contract", async () => {
  const scheduler = new TestScheduler()
  const { app, liveSubscription } = appCreate(
    async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "replay" as const,
        pages: backlogPages(),
        replayUpperBound: 0,
        selectedCursor: undefined,
      }),
    scheduler,
  )
  const response = await app.request("https://global-events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const reader = response.body?.getReader()
  liveSubscription.globalSummaryPublish(userId, {
    data: {
      eventType: "input-needed",
      globalSequence: 1,
      id: "global-cursor-1",
      requestId: "request-1",
      runId: "run-1",
      sessionId: "session-1",
      sessionRevision: 1,
      summary: "x".repeat(100_000),
    },
    event: "input-needed",
    id: "global-cursor-1",
  } as never)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(1)
  await reader?.cancel().catch(() => undefined)
})
