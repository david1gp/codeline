import { expect, test } from "bun:test"
import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiEventsRoutesAdd } from "../src/events/api/apiEventsRoutesAdd.js"
import { identitySessionLoad } from "../src/identity/actions/identitySessionLoad.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalGlobalSummaryBacklogRead } from "../src/journal/actions/journalGlobalSummaryBacklogRead.js"
import { journalGlobalSummaryPostCommitPublishCreate } from "../src/journal/actions/journalGlobalSummaryPostCommitPublishCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import type { StreamSseConnectionWriterSinkFactory } from "../src/stream/actions/streamSseConnectionWriterSinkFactory.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"

type Timer = { callback: () => void; dueAt: number; intervalMs: number; repeating: boolean }
type GlobalSummaryLiveSubscription = Pick<ReturnType<typeof streamLiveSubscriptionCreate>, "globalSummarySubscribe">
type GlobalSummarySubscriber = Parameters<GlobalSummaryLiveSubscription["globalSummarySubscribe"]>[1]

class TestScheduler {
  currentTime = 0
  private nextTimerId = 1
  private readonly timers = new Map<number, Timer>()

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

  advance = (milliseconds: number): void => {
    this.currentTime += milliseconds
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= this.currentTime)
        .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0]
      if (due === undefined) return
      const [id, timer] = due
      if (timer.repeating) timer.dueAt += timer.intervalMs
      else this.timers.delete(id)
      timer.callback()
    }
  }

  timerCount = (): number => this.timers.size
}

const userId = "events-user"
const cursorCodec: JournalCursorCodec = {
  decode: (cursor) => createResult({ journalId: String(cursor), sequence: 1, version: 1 }),
  encode: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
  encodeDeterministic: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
  encodeGlobalSequence: (journalId, globalSequence) => createResult(`cursor-${journalId}-${globalSequence}`),
  validate: (cursor, journalId) => {
    const prefix = `cursor-${journalId}-`
    if (typeof cursor !== "string" || !cursor.startsWith(prefix))
      return createResultErrorCode(
        "journalCursorValidate",
        "The journal cursor belongs to another user.",
        "cursor_owner_mismatch",
      )
    return createResult({ journalId: String(journalId), sequence: Number(cursor.slice(prefix.length)), version: 1 })
  },
  validateGlobalSequence: (cursor, journalId) => {
    const prefix = `cursor-${journalId}-`
    if (typeof cursor !== "string" || !cursor.startsWith(prefix))
      return createResultErrorCode(
        "journalGlobalCursorValidate",
        "The global cursor belongs to another user.",
        "cursor_owner_mismatch",
      )
    return createResult({
      globalSequence: Number(cursor.slice(prefix.length)),
      journalId: String(journalId),
      version: 1,
    })
  },
}

function frame(sequence: number, id = `cursor-${userId}-${sequence}`): GlobalSummarySseFrame {
  return {
    data: { eventType: "run-started", globalSequence: sequence, id, runId: "run-1", sessionId: "session-1" },
    event: "run-started",
    id,
  }
}

function completedFrame(sequence: number): GlobalSummarySseFrame {
  const id = `cursor-${userId}-${sequence}`
  return {
    data: {
      changePosition: sequence,
      eventType: "run-completed",
      id,
      messageId: null,
      runId: "run-1",
      globalSequence: sequence,
      sessionId: "session-1",
      sessionRevision: 1,
    },
    event: "run-completed",
    id,
  }
}

function backlogPages(
  ...pages: readonly GlobalSummarySseFrame[][]
): AsyncIterable<Result<readonly GlobalSummarySseFrame[]>> {
  return (async function* () {
    for (const page of pages) yield createResult(page)
  })()
}

function emptyBacklog(afterGlobalSequence = 0, selectedCursor: string | undefined = undefined) {
  return createResult({
    afterGlobalSequence,
    mode: "replay" as const,
    pages: backlogPages(),
    replayUpperBound: afterGlobalSequence,
    selectedCursor,
  })
}

function schedulerCreate(): TestScheduler {
  return new TestScheduler()
}

function trackedLiveSubscriptionCreate() {
  const liveSubscription = streamLiveSubscriptionCreate()
  let unsubscribeCount = 0
  return {
    ...liveSubscription,
    globalSummarySubscribe: (
      subscriberUserId: string,
      subscriber: Parameters<typeof liveSubscription.globalSummarySubscribe>[1],
    ) => {
      const unsubscribe = liveSubscription.globalSummarySubscribe(subscriberUserId, subscriber)
      return () => {
        unsubscribeCount += 1
        unsubscribe()
      }
    },
    unsubscribeCount: () => unsubscribeCount,
  }
}

function globalSummaryLiveSubscriptionCreate() {
  let subscriber: GlobalSummarySubscriber | undefined
  let subscriberCount = 0
  return {
    globalSummarySubscribe: (_userId: string, next: GlobalSummarySubscriber) => {
      subscriber = next
      subscriberCount += 1
      let active = true
      return () => {
        if (!active) return
        active = false
        subscriberCount -= 1
        if (subscriber === next) subscriber = undefined
      }
    },
    publish: (event: unknown, publishedUserId = userId): void => {
      subscriber?.(event as GlobalSummarySseFrame, publishedUserId)
    },
    subscriberCount: () => subscriberCount,
  } satisfies GlobalSummaryLiveSubscription & {
    publish: (event: unknown, publishedUserId?: string) => void
    subscriberCount: () => number
  }
}

function globalSummaryFrame(globalSequence: number): GlobalSummarySseFrame {
  const id = `cursor-${userId}-${globalSequence}`
  return {
    data: { eventType: "run-started", globalSequence, id, runId: "run-1", sessionId: "session-1" },
    event: "run-started",
    id,
  }
}

function largeGlobalSummaryFrame(globalSequence: number): GlobalSummarySseFrame {
  const id = `cursor-${userId}-${globalSequence}`
  return {
    data: {
      eventType: "input-needed",
      globalSequence,
      id,
      requestId: `request-${globalSequence}`,
      runId: "run-1",
      sessionId: "session-1",
      sessionRevision: 1,
      summary: "x".repeat(4_096),
    },
    event: "input-needed",
    id,
  }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

function parseFrame(chunk: Uint8Array): { data: Record<string, unknown>; event: string; id: string } {
  const text = new TextDecoder().decode(chunk)
  const id = text.match(/^id: ([^\n]+)/m)?.[1] ?? ""
  const eventName = text.match(/^event: ([^\n]+)/m)?.[1] ?? ""
  const data = text.match(/^data: ([^\n]+)/m)?.[1] ?? "{}"
  return { data: JSON.parse(data) as Record<string, unknown>, event: eventName, id }
}

function appForEvents(options: {
  backlogRead: typeof journalGlobalSummaryBacklogRead
  authenticationNow?: () => Date
  globalSummaryLiveSubscription?: GlobalSummaryLiveSubscription
  identitySessionLoad?: typeof identitySessionLoad
  liveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
  scheduler?: TestScheduler
  connectionWriterCreate?: typeof streamSseConnectionWriterCreate
  sinkCreate?: StreamSseConnectionWriterSinkFactory
}) {
  const scheduler = options.scheduler ?? schedulerCreate()
  const app = new Hono<AppEnvironment>()
  const api = new Hono<AppEnvironment>()
  const configuration = {
    authMode: "oidc" as const,
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "test" as const,
    publicOrigin: "https://events.test/",
  }
  const database = {} as never
  app.use(
    "/api/*",
    authenticationMiddleware(configuration, database, {
      identitySessionLoad:
        options.identitySessionLoad ??
        (async () =>
          createResult({
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
            id: "session-1",
            lastUsedAt: null,
            revokedAt: null,
            tokenHash: "token-hash",
            userId,
          } as never)),
      now: options.authenticationNow,
    }),
  )
  apiEventsRoutesAdd(api, {
    backlogRead: options.backlogRead,
    connectionWriterCreate: options.connectionWriterCreate ?? streamSseConnectionWriterCreate,
    cursorCodec,
    globalSummaryLiveSubscription:
      options.globalSummaryLiveSubscription ?? options.liveSubscription ?? streamLiveSubscriptionCreate(),
    metricsCollector: metricsCollectorCreate(),
    now: () => scheduler.currentTime,
    scheduler,
    sinkCreate: options.sinkCreate,
  })
  app.route("/api", api)
  return app
}

function resetFrame(sequence: number): GlobalSummarySseFrame {
  const id = `cursor-${userId}-${sequence}`
  return {
    data: { asOfGlobalSequence: sequence, eventType: "reset", globalSequence: sequence, id, reason: "cursor-expired" },
    event: "reset",
    id,
  }
}

test("requires the existing session cookie and sends the generalized SSE headers", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription,
  })

  const unauthenticated = await app.request("https://events.test/api/events")
  expect(unauthenticated.status).toBe(401)

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform")
  expect(response.headers.get("Content-Type")).toBe("text/event-stream")
  expect(response.headers.get("Connection")).toBe("keep-alive")
  expect(response.headers.get("X-Accel-Buffering")).toBe("no")
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(1)
  await response.body?.cancel()
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("returns 401 when an authenticated event-feed reconnect reaches the injected session expiry", async () => {
  let now = new Date("2026-08-23T00:00:00.000Z")
  const expiresAt = new Date(now.getTime() + 1_000)
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    authenticationNow: () => now,
    backlogRead: async () => emptyBacklog(),
    identitySessionLoad: async (_database, _token, sessionNow) =>
      (sessionNow ?? new Date()) < expiresAt
        ? createResult({
            createdAt: new Date("2026-08-22T00:00:00.000Z"),
            expiresAt,
            id: "session-1",
            lastUsedAt: null,
            revokedAt: null,
            tokenHash: "token-hash",
            userId,
          } as never)
        : createResult(undefined),
    liveSubscription,
  })
  const headers = { Cookie: "__Host-codeline-session=session-token" }

  const connected = await app.request("https://events.test/api/events", { headers })
  expect(connected.status).toBe(200)
  await connected.body?.cancel()
  await flush()

  now = expiresAt
  const reconnect = await app.request("https://events.test/api/events", { headers })
  expect(reconnect.status).toBe(401)
  expect(reconnect.headers.get("Cache-Control")).toBe("no-store")
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("passes Last-Event-ID before after and isolates cursor errors to the authenticated user", async () => {
  const calls: Array<{ after?: unknown; lastEventId?: unknown; userId: unknown }> = []
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async (_dependencies, input) => {
      calls.push(input)
      if (input.lastEventId === "cross-user")
        return createResultErrorCode(
          "journalGlobalSummaryBacklogRead",
          "The journal cursor belongs to another user.",
          "cursor_owner_mismatch",
        )
      return emptyBacklog(0, input.lastEventId as string)
    },
    liveSubscription,
  })

  const response = await app.request("https://events.test/api/events?after=query-cursor", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": `cursor-${userId}-1` },
  })
  expect(response.status).toBe(200)
  expect(calls).toEqual([{ after: "query-cursor", lastEventId: `cursor-${userId}-1`, userId }])
  await response.body?.cancel()

  const crossUser = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": "cross-user" },
  })
  expect(crossUser.status).toBe(400)
})

test("rejects a malformed global cursor before opening the stream or reading its backlog", async () => {
  let backlogReads = 0
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => {
      backlogReads += 1
      return emptyBacklog()
    },
    liveSubscription,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": `cursor-${userId}-not-a-number` },
  })

  expect(response.status).toBe(400)
  expect(backlogReads).toBe(0)
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("rejects global transcript and delta payloads before delivering them to the client", async () => {
  const globalSummarySubscription = globalSummaryLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    globalSummaryLiveSubscription: globalSummarySubscription,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)

  const valid = globalSummaryFrame(1)
  globalSummarySubscription.publish({
    data: { ...valid.data, delta: "x".repeat(200_000), transcript: "must-not-leak" },
    event: valid.event,
    id: valid.id,
  })
  await flush()

  expect(globalSummarySubscription.subscriberCount()).toBe(0)
  await response.body?.cancel().catch(() => undefined)
})

test("uses the authenticated cursor baseline to reject stale live publications", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(1, "cursor"),
    liveSubscription,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token", "Last-Event-ID": `cursor-${userId}-1` },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  liveSubscription.globalSummaryPublish(userId, frame(1))
  liveSubscription.globalSummaryPublish(userId, frame(2))
  const result = await reader.read()
  expect(parseFrame(result.value as Uint8Array).data.globalSequence).toBe(2)
  await reader.cancel()
})

test("rejects an expired global cursor before returning the event stream", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  let subscribedDuringBacklog = false
  const app = appForEvents({
    backlogRead: async () => {
      subscribedDuringBacklog = liveSubscription.globalSummarySubscriberCount(userId) === 1
      liveSubscription.globalSummaryPublish(userId, frame(1))
      return createResult({
        afterGlobalSequence: 0,
        pages: backlogPages([resetFrame(2)]),
        replayUpperBound: 2,
        mode: "reset",
        selectedCursor: "expired",
      })
    },
    liveSubscription,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(400)
  expect(subscribedDuringBacklog).toBe(true)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("delivers an event published during snapshot acquisition once before later live events", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const snapshotFrame = frame(1, `cursor-${userId}-1`)
  const app = appForEvents({
    backlogRead: async () => {
      liveSubscription.globalSummaryPublish(userId, snapshotFrame)
      return createResult({
        afterGlobalSequence: 0,
        mode: "replay",
        pages: backlogPages([snapshotFrame]),
        replayUpperBound: 1,
        selectedCursor: undefined,
      })
    },
    liveSubscription,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  liveSubscription.globalSummaryPublish(userId, frame(2))
  const received: Array<ReturnType<typeof parseFrame>> = []
  while (received.length < 2) {
    const result = await reader.read()
    expect(result.done).toBe(false)
    if (result.done || result.value === undefined) break
    received.push(parseFrame(result.value))
  }

  expect(received.map((receivedFrame) => receivedFrame.data.globalSequence)).toEqual([1, 2])
  expect(new Set(received.map((receivedFrame) => receivedFrame.data.globalSequence)).size).toBe(2)
  const firstReceived = received[0]
  expect(firstReceived?.data.eventType).toBe("run-started")
  await reader.cancel()
})

test("emits a fifteen-second heartbeat and removes the subscription on request abort", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = streamLiveSubscriptionCreate()
  const abortController = new AbortController()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription,
    scheduler,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
    signal: abortController.signal,
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return
  scheduler.advance(15_000)
  await flush()
  const heartbeat = await reader.read()
  expect(new TextDecoder().decode(heartbeat.value)).toBe(": heartbeat\n\n")

  abortController.abort()
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("aborting /api/events unsubscribes once, clears blocked work, and closes output idempotently", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = trackedLiveSubscriptionCreate()
  const abortController = new AbortController()
  const pendingWrite = new Promise<void>(() => undefined)
  const abortReasons: unknown[] = []
  let outputAbortCount = 0
  let outputCloseCount = 0
  let outputClosed = false
  let writeCount = 0
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    connectionWriterCreate: (dependencies) =>
      streamSseConnectionWriterCreate({
        ...dependencies,
        writer: {
          ...dependencies.writer,
          abort: (reason) => {
            outputAbortCount += 1
            abortReasons.push(reason)
            return Promise.resolve(dependencies.writer.abort(reason)).finally(() => {
              outputClosed = true
            })
          },
          close: () => {
            outputCloseCount += 1
            return Promise.resolve(dependencies.writer.close()).finally(() => {
              outputClosed = true
            })
          },
          write: () => {
            writeCount += 1
            return pendingWrite
          },
        },
      }),
    liveSubscription,
    scheduler,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
    signal: abortController.signal,
  })
  expect(response.status).toBe(200)
  await flush()

  liveSubscription.globalSummaryPublish(userId, frame(1))
  await flush()
  expect(writeCount).toBe(1)
  expect(scheduler.timerCount()).toBe(2)

  abortController.abort()
  await flush()
  await response.body?.cancel().catch(() => undefined)
  abortController.abort()
  liveSubscription.globalSummaryPublish(userId, frame(2))
  scheduler.advance(15_000)
  await flush()

  expect(liveSubscription.unsubscribeCount()).toBe(1)
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
  expect(outputAbortCount).toBe(1)
  expect(outputCloseCount).toBe(0)
  expect(outputClosed).toBe(true)
  expect(abortReasons).toEqual(["request-aborted"])
  expect(writeCount).toBe(1)
})

test("publishes committed journal events into the authenticated feed with opaque cursors", async () => {
  // Domain mutations remain task 8/10/12 work; task 6 verifies the post-commit seam directly.
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  const publish = journalGlobalSummaryPostCommitPublishCreate({ cursorCodec, liveSubscription })
  const published = await publish([
    {
      createdAt: new Date(),
      eventType: "run-started",
      id: "database-event-1",
      payload: { runId: "run-1", sessionId: "session-1" },
      sequence: 1,
      serializedBytes: 128,
      userId,
    } as never,
  ])
  expect(published.success).toBe(true)
  const result = await reader.read()
  const publishedFrame = parseFrame(result.value as Uint8Array)
  expect(publishedFrame.id).toBe(`cursor-${userId}-1`)
  expect(publishedFrame.data.id).toBe(`cursor-${userId}-1`)
  await reader.cancel()
})

test("keeps a healthy SSE subscriber alive and replays a terminal event after another disconnects", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = streamLiveSubscriptionCreate()
  const terminalFrame = completedFrame(1)
  let committed = false
  let connectionCount = 0
  const failedWriterCreate: typeof streamSseConnectionWriterCreate = (dependencies) => {
    connectionCount += 1
    if (connectionCount !== 1) return streamSseConnectionWriterCreate(dependencies)
    return streamSseConnectionWriterCreate({
      ...dependencies,
      writer: {
        ...dependencies.writer,
        write: () => Promise.reject(new Error("The SSE subscriber disconnected.")),
      },
    })
  }
  const app = appForEvents({
    backlogRead: async (_dependencies, input) =>
      committed
        ? createResult({
            afterGlobalSequence: 0,
            mode: "replay",
            pages: backlogPages([terminalFrame]),
            replayUpperBound: 1,
            selectedCursor: input.lastEventId as string,
          })
        : emptyBacklog(),
    connectionWriterCreate: failedWriterCreate,
    liveSubscription,
    scheduler,
  })
  const headers = { Cookie: "__Host-codeline-session=session-token" }

  const failedResponse = await app.request("https://events.test/api/events", { headers })
  const failedReader = failedResponse.body?.getReader()
  const healthyResponse = await app.request("https://events.test/api/events", { headers })
  const healthyReader = healthyResponse.body?.getReader()
  expect(failedReader).toBeDefined()
  expect(healthyReader).toBeDefined()
  if (failedReader === undefined || healthyReader === undefined) return
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(2)

  committed = true
  const published = await journalGlobalSummaryPostCommitPublishCreate({ cursorCodec, liveSubscription })([
    {
      createdAt: new Date(),
      eventType: "run-completed",
      id: "journal-terminal-1",
      payload: { changePosition: 1, messageId: null, runId: "run-1", sessionId: "session-1", sessionRevision: 1 },
      sequence: 1,
      serializedBytes: 128,
      userId,
    } as never,
  ])
  expect(published.success).toBe(true)
  const healthyResult = await healthyReader.read()
  expect(parseFrame(healthyResult.value as Uint8Array)).toEqual(terminalFrame)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(1)

  const reconnect = await app.request("https://events.test/api/events", {
    headers: { ...headers, "Last-Event-ID": `cursor-${userId}-0` },
  })
  const reconnectReader = reconnect.body?.getReader()
  expect(reconnectReader).toBeDefined()
  if (reconnectReader === undefined) return
  const recovered = await reconnectReader.read()
  expect(parseFrame(recovered.value as Uint8Array)).toEqual(terminalFrame)

  await failedReader.cancel().catch(() => undefined)
  await healthyReader.cancel().catch(() => undefined)
  await reconnectReader.cancel().catch(() => undefined)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("disconnects when a live frame is invalid or belongs to another user", async () => {
  const invalidSubscription = globalSummaryLiveSubscriptionCreate()
  const invalidApp = appForEvents({
    backlogRead: async () => emptyBacklog(),
    globalSummaryLiveSubscription: invalidSubscription,
  })
  const invalidResponse = await invalidApp.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const invalidReader = invalidResponse.body?.getReader()
  invalidSubscription.publish({ data: {}, event: "delta", id: "invalid" } as never)
  try {
    await invalidReader?.read()
  } catch (_error) {
    // The invalid publication deliberately aborts the stream.
  }
  await flush()
  expect(invalidSubscription.subscriberCount()).toBe(0)
  await invalidReader?.cancel().catch(() => undefined)

  const crossUserSubscription = globalSummaryLiveSubscriptionCreate()
  const crossUserApp = appForEvents({
    backlogRead: async () => emptyBacklog(),
    globalSummaryLiveSubscription: crossUserSubscription,
  })
  const crossUserResponse = await crossUserApp.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const crossUserReader = crossUserResponse.body?.getReader()
  crossUserSubscription.publish(frame(1, "cursor-other-user-1"), "other-user")
  try {
    await crossUserReader?.read()
  } catch (_error) {
    // The cross-user publication deliberately aborts the stream.
  }
  await flush()
  expect(crossUserSubscription.subscriberCount()).toBe(0)
  await crossUserReader?.cancel().catch(() => undefined)
})

test("requires the cursor dependency when constructing the authenticated events route", () => {
  const api = new Hono<AppEnvironment>()
  expect(() =>
    apiEventsRoutesAdd(api, {
      backlogRead: async () => emptyBacklog(),
      connectionWriterCreate: streamSseConnectionWriterCreate,
      cursorCodec: undefined as never,
      globalSummaryLiveSubscription: streamLiveSubscriptionCreate(),
      metricsCollector: metricsCollectorCreate(),
      now: Date.now,
      scheduler: schedulerCreate(),
    }),
  ).toThrow("cursor codec is required")

  expect(() =>
    apiEventsRoutesAdd(api, {
      backlogRead: async () => emptyBacklog(),
      connectionWriterCreate: streamSseConnectionWriterCreate,
      cursorCodec: { validateGlobalSequence: () => createResult({ globalSequence: 0 }) } as never,
      globalSummaryLiveSubscription: streamLiveSubscriptionCreate(),
      metricsCollector: metricsCollectorCreate(),
      now: Date.now,
      scheduler: schedulerCreate(),
    }),
  ).toThrow("global summary event feed cursor codec is required")
})

test("uses the injected route sink factory without changing the response adapter", async () => {
  let sinkFactoryCalls = 0
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription,
    sinkCreate: (outputWriter) => {
      sinkFactoryCalls += 1
      return {
        abort: (reason) => outputWriter.abort(reason),
        close: () => outputWriter.close(),
        write: (chunk) => outputWriter.write(chunk),
      }
    },
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  expect(sinkFactoryCalls).toBe(1)
  await response.body?.cancel()
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("disconnects a slow client through the injected connection writer", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = streamLiveSubscriptionCreate()
  const slowWriterCreate: typeof streamSseConnectionWriterCreate = (dependencies) =>
    streamSseConnectionWriterCreate({
      ...dependencies,
      writer: {
        ...dependencies.writer,
        write: () => new Promise<void>(() => undefined),
      },
    })
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    connectionWriterCreate: slowWriterCreate,
    liveSubscription,
    scheduler,
  })
  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  liveSubscription.globalSummaryPublish(userId, frame(1))
  scheduler.advance(15_000)
  await flush()
  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
})

test("disconnects and cleans up when a backlog event exceeds the serialized SSE limit", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  let abortReason: unknown
  const app = appForEvents({
    backlogRead: async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "replay",
        pages: backlogPages([
          {
            data: {
              eventType: "input-needed",
              globalSequence: 1,
              id: `cursor-${userId}-1`,
              requestId: "request-1",
              runId: "run-1",
              sessionId: "session-1",
              sessionRevision: 1,
              summary: "x".repeat(200_000),
            },
            event: "input-needed",
            id: `cursor-${userId}-1`,
          } as never,
        ]),
        replayUpperBound: 1,
        selectedCursor: undefined,
      }),
    connectionWriterCreate: (dependencies) =>
      streamSseConnectionWriterCreate({
        ...dependencies,
        writer: {
          ...dependencies.writer,
          abort: (reason) => {
            abortReason = reason
            return dependencies.writer.abort(reason)
          },
        },
      }),
    liveSubscription,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  await flush()

  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
  expect(abortReason).toBe("backlog-frame-invalid")
  await response.body?.cancel().catch(() => undefined)
})

test("disconnects and cleans up when the endpoint event queue exceeds its event limit", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = streamLiveSubscriptionCreate()
  let abortReason: unknown
  const blockedWriterCreate: typeof streamSseConnectionWriterCreate = (dependencies) =>
    streamSseConnectionWriterCreate({
      ...dependencies,
      writer: {
        ...dependencies.writer,
        abort: (reason) => {
          abortReason = reason
          return dependencies.writer.abort(reason)
        },
        write: () => new Promise<void>(() => undefined),
      },
    })
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    connectionWriterCreate: blockedWriterCreate,
    liveSubscription,
    scheduler,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  for (let sequence = 1; sequence <= 1_025; sequence += 1)
    liveSubscription.globalSummaryPublish(userId, frame(sequence))
  await flush()

  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
  expect(abortReason).toBe("connection-queue-event-overflow")
  await response.body?.cancel().catch(() => undefined)
})

test("disconnects and cleans up when the endpoint event queue exceeds its byte limit", async () => {
  const scheduler = schedulerCreate()
  const liveSubscription = streamLiveSubscriptionCreate()
  let abortReason: unknown
  const blockedWriterCreate: typeof streamSseConnectionWriterCreate = (dependencies) =>
    streamSseConnectionWriterCreate({
      ...dependencies,
      writer: {
        ...dependencies.writer,
        abort: (reason) => {
          abortReason = reason
          return dependencies.writer.abort(reason)
        },
        write: () => new Promise<void>(() => undefined),
      },
    })
  const app = appForEvents({
    backlogRead: async () => emptyBacklog(),
    connectionWriterCreate: blockedWriterCreate,
    liveSubscription,
    scheduler,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  expect(response.status).toBe(200)
  for (let sequence = 1; sequence <= 300; sequence += 1)
    liveSubscription.globalSummaryPublish(userId, largeGlobalSummaryFrame(sequence))
  await flush()

  expect(liveSubscription.globalSummarySubscriberCount(userId)).toBe(0)
  expect(abortReason).toBe("connection-queue-byte-overflow")
  await response.body?.cancel().catch(() => undefined)
})

test("replays more than 1,024 events through a delayed Response reader with bounded pages and staging", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const scheduler = schedulerCreate()
  const replayEvents = Array.from({ length: 1_100 }, (_, index) => frame(index + 1))
  const pageSize = 64
  let maximumPageSize = 0
  let connection: ReturnType<typeof streamSseConnectionWriterCreate> | undefined
  let releaseFirstWrite: () => void = () => undefined
  let firstWriteStartedResolve: () => void = () => undefined
  const firstWriteStarted = new Promise<void>((resolve) => {
    firstWriteStartedResolve = resolve
  })
  const firstWriteRelease = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve
  })
  let firstWrite = true
  const pages = (async function* () {
    for (let offset = 0; offset < replayEvents.length; offset += pageSize) {
      const page = replayEvents.slice(offset, offset + pageSize)
      maximumPageSize = Math.max(maximumPageSize, page.length)
      yield createResult(page)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  })()
  const connectionWriterCreate: typeof streamSseConnectionWriterCreate = (dependencies) => {
    const created = streamSseConnectionWriterCreate({
      ...dependencies,
      writer: {
        ...dependencies.writer,
        write: async (chunk) => {
          if (firstWrite) {
            firstWrite = false
            firstWriteStartedResolve()
            await firstWriteRelease
          }
          await dependencies.writer.write(chunk)
        },
      },
    })
    connection = created
    return created
  }
  const app = appForEvents({
    backlogRead: async () =>
      createResult({
        afterGlobalSequence: 0,
        mode: "replay",
        pages,
        replayUpperBound: 1_100,
        selectedCursor: undefined,
      }),
    connectionWriterCreate,
    liveSubscription,
    scheduler,
  })

  const response = await app.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return
  await firstWriteStarted
  await new Promise<void>((resolve) => setTimeout(resolve, 10))

  const replayWriteInFlight = connection !== undefined && connection.queuedReplayEventCount() > 0
  liveSubscription.globalSummaryPublish(userId, frame(500))
  liveSubscription.globalSummaryPublish(userId, frame(1_101))
  liveSubscription.globalSummaryPublish(userId, frame(1_101))
  expect(replayWriteInFlight).toBe(true)
  releaseFirstWrite()

  const sequences: number[] = []
  while (sequences.length < 1_101) {
    const result = await reader.read()
    expect(result.done).toBe(false)
    if (result.done || result.value === undefined) break
    sequences.push(parseFrame(result.value).data.globalSequence as number)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  expect(sequences).toEqual(Array.from({ length: 1_101 }, (_, index) => index + 1))
  expect(new Set(sequences).size).toBe(sequences.length)
  expect(maximumPageSize).toBeLessThanOrEqual(pageSize)
  expect(connection?.maximumReplayStagingEventCount()).toBeLessThanOrEqual(128)
  expect(connection?.maximumReplayStagingByteCount()).toBeLessThanOrEqual(1 * 1024 * 1024)
  await reader.cancel()
})
