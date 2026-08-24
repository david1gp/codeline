import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiMetricsRoutesAdd } from "../src/api/diagnostics/apiMetricsRoutesAdd.js"
import { apiCompleteSnapshotResponseCreate } from "../src/api/response/apiCompleteSnapshotResponseCreate.js"
import { apiEventsRoutesAdd } from "../src/events/api/apiEventsRoutesAdd.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"

type Timer = { callback: () => void; dueAt: number }

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

  setInterval = (callback: () => void, timeoutMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, { callback, dueAt: this.currentTime + timeoutMs })
    return id
  }

  setTimeout = (callback: () => void, timeoutMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, { callback, dueAt: this.currentTime + timeoutMs })
    return id
  }

  advance = (milliseconds: number): void => {
    this.currentTime += milliseconds
    for (const [id, timer] of this.timers) {
      if (timer.dueAt > this.currentTime) continue
      this.timers.delete(id)
      timer.callback()
    }
  }
}

function metricValue(
  metrics: ReturnType<typeof metricsCollectorCreate>,
  name: string,
  labels: Readonly<Record<string, string>> = {},
): number {
  return (
    metrics
      .snapshot()
      .metrics.find((metric) => metric.name === name && JSON.stringify(metric.labels) === JSON.stringify(labels))
      ?.value ?? 0
  )
}

function event(sequence: number) {
  return {
    delta: `delta-${sequence}`,
    deltaKind: "text" as const,
    eventType: "delta" as const,
    id: `event-${sequence}`,
    messageId: null,
    runId: "run-1",
    sequence,
    sessionId: "session-1",
  }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

test("collector combines labeled increments and active connection deltas", () => {
  const metrics = metricsCollectorCreate()

  metrics.increment("sse_connections_active")
  metrics.increment("sse_connections_active", -1)
  metrics.increment("sse_disconnect_total", 1, { reason: "request-aborted" })
  metrics.increment("sse_disconnect_total", 2, { reason: "request-aborted" })

  expect(metricValue(metrics, "sse_connections_active")).toBe(0)
  expect(metricValue(metrics, "sse_disconnect_total", { reason: "request-aborted" })).toBe(3)
})

test("snapshot compression records compressed, identity, fallback, and rejection outcomes", async () => {
  const metrics = metricsCollectorCreate()
  const dependencies = {
    compressionStreamCreate: (encoding: "deflate" | "gzip") => new CompressionStream(encoding),
  }

  await apiCompleteSnapshotResponseCreate(
    { value: "compressed" },
    { acceptEncoding: "gzip", dependencies, headers: {}, metricsCollector: metrics },
  )
  await apiCompleteSnapshotResponseCreate(
    { value: "identity" },
    { acceptEncoding: "identity", dependencies, headers: {}, metricsCollector: metrics },
  )
  await apiCompleteSnapshotResponseCreate(
    { value: "fallback" },
    {
      acceptEncoding: "gzip",
      dependencies: {
        compressionStreamCreate: () => {
          throw new Error("unavailable")
        },
      },
      headers: {},
      metricsCollector: metrics,
    },
  )
  await apiCompleteSnapshotResponseCreate(
    { value: "rejected" },
    { acceptEncoding: "gzip;q=0, identity;q=0", dependencies, headers: {}, metricsCollector: metrics },
  )

  expect(metricValue(metrics, "snapshot_compression_total", { outcome: "gzip" })).toBe(1)
  expect(metricValue(metrics, "snapshot_compression_total", { outcome: "identity" })).toBe(1)
  expect(metricValue(metrics, "snapshot_compression_total", { outcome: "fallback" })).toBe(1)
  expect(metricValue(metrics, "snapshot_compression_total", { outcome: "not-acceptable" })).toBe(1)
})

test("SSE writer records lifecycle, queue overflow, blocked timeout, and write failure", async () => {
  const metrics = metricsCollectorCreate()
  const scheduler = new TestScheduler()
  let releaseWrite = (): void => undefined
  const blockedWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const subscription = streamLiveSubscriptionCreate()
  const connection = streamSseConnectionWriterCreate({
    baselineSequence: 0,
    metricsCollector: metrics,
    now: () => scheduler.currentTime,
    scheduler,
    subscription,
    userId: "metrics-user",
    writer: {
      abort: () => undefined,
      close: () => undefined,
      write: () => blockedWrite,
    },
  })

  expect(connection.connect().success).toBe(true)
  expect(metricValue(metrics, "sse_connections_open_total")).toBe(1)
  expect(metricValue(metrics, "sse_connections_active")).toBe(1)
  expect(connection.completeBacklog().success).toBe(true)
  subscription.publish("metrics-user", event(1))
  scheduler.advance(15_000)
  await flush()
  expect(metricValue(metrics, "sse_blocked_write_timeout_total")).toBe(1)
  expect(metricValue(metrics, "sse_connections_disconnect_total", { reason: "blocked-or-failed-write" })).toBe(1)
  expect(metricValue(metrics, "sse_connections_active")).toBe(0)
  releaseWrite()

  const overflowScheduler = new TestScheduler()
  const overflowSubscription = streamLiveSubscriptionCreate()
  const overflow = streamSseConnectionWriterCreate({
    baselineSequence: 0,
    metricsCollector: metrics,
    now: () => overflowScheduler.currentTime,
    scheduler: overflowScheduler,
    subscription: overflowSubscription,
    userId: "metrics-overflow-user",
    writer: { abort: () => undefined, close: () => undefined, write: () => new Promise<void>(() => undefined) },
  })
  expect(overflow.connect().success).toBe(true)
  expect(overflow.completeBacklog().success).toBe(true)
  for (let sequence = 1; sequence <= 1_025; sequence += 1)
    overflowSubscription.publish("metrics-overflow-user", event(sequence))
  expect(metricValue(metrics, "sse_queue_overflow_total", { reason: "events" })).toBe(1)

  const failedScheduler = new TestScheduler()
  const failedSubscription = streamLiveSubscriptionCreate()
  const failed = streamSseConnectionWriterCreate({
    baselineSequence: 0,
    metricsCollector: metrics,
    now: () => failedScheduler.currentTime,
    scheduler: failedScheduler,
    subscription: failedSubscription,
    userId: "metrics-failed-user",
    writer: { abort: () => undefined, close: () => undefined, write: async () => Promise.reject(new Error("failed")) },
  })
  expect(failed.connect().success).toBe(true)
  expect(failed.completeBacklog().success).toBe(true)
  failedSubscription.publish("metrics-failed-user", event(1))
  await flush()
  expect(metricValue(metrics, "sse_write_failure_total")).toBe(1)
})

test("metrics diagnostics require authentication and return structured counters", async () => {
  const metrics = metricsCollectorCreate()
  metrics.increment("snapshot_response_total", 1, { status: "200" })
  const unauthenticated = new Hono<AppEnvironment>()
  apiMetricsRoutesAdd(unauthenticated, metrics)
  expect((await unauthenticated.request("http://codeline.test/diagnostics/metrics")).status).toBe(401)

  const authenticated = new Hono<AppEnvironment>()
  authenticated.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "metrics-user" })
    await next()
  })
  apiMetricsRoutesAdd(authenticated, metrics)
  const response = await authenticated.request("http://codeline.test/diagnostics/metrics")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    metrics: [{ labels: { status: "200" }, name: "snapshot_response_total", value: 1 }],
  })
})

test("event route records replay and reset outcomes", async () => {
  const metrics = metricsCollectorCreate()
  const subscription = streamLiveSubscriptionCreate()
  const cursorCodec = {
    decode: () => createResult({ journalId: "metrics-user", sequence: 0, version: 1 }),
    encode: () => createResult("cursor"),
    encodeDeterministic: () => createResult("cursor"),
    validate: () => createResult({ journalId: "metrics-user", sequence: 0 }),
  } as unknown as JournalCursorCodec
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", {} as never)
    context.set("requestIdentity", { userId: "metrics-user" })
    await next()
  })

  let mode: "replay" | "reset" = "replay"
  const pages = async function* () {
    yield createResult([])
  }
  const scheduler = new TestScheduler()
  apiEventsRoutesAdd(app, {
    backlogRead: async () =>
      createResult({ afterSequence: 0, mode, pages: pages(), replayUpperBound: 0, selectedCursor: undefined }),
    connectionWriterCreate: streamSseConnectionWriterCreate,
    cursorCodec,
    liveSubscription: subscription,
    metricsCollector: metrics,
    now: () => scheduler.currentTime,
    scheduler,
  })

  const replay = await app.request("http://codeline.test/events")
  expect(replay.status).toBe(200)
  await replay.body?.cancel()
  mode = "reset"
  const reset = await app.request("http://codeline.test/events")
  expect(reset.status).toBe(200)
  await reset.body?.cancel()
  expect(metricValue(metrics, "sse_replay_total")).toBe(1)
  expect(metricValue(metrics, "sse_reset_total")).toBe(1)
})
