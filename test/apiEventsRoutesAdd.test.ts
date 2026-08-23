import { expect, test } from "bun:test"
import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiEventsRoutesAdd } from "../src/events/api/apiEventsRoutesAdd.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import type { JournalEvent } from "../src/stream/schema/journalEventSchema.js"

type Timer = { callback: () => void; dueAt: number; intervalMs: number; repeating: boolean }

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
}

const userId = "events-user"
const cursorCodec: JournalCursorCodec = {
  decode: (cursor) => createResult({ journalId: String(cursor), sequence: 1, version: 1 }),
  encode: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
  encodeDeterministic: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
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
}

function event(sequence: number, id = `event-${sequence}`): JournalEvent {
  return {
    delta: `delta-${sequence}`,
    deltaKind: "text",
    eventType: "delta",
    id,
    messageId: null,
    runId: "run-1",
    sequence,
    sessionId: "session-1",
  }
}

function frame(sequence: number, id = `cursor-${userId}-${sequence}`): StreamSseFrame {
  return { data: { ...event(sequence), id }, event: "delta", id }
}

function backlogPages(...pages: readonly StreamSseFrame[][]): AsyncIterable<Result<readonly StreamSseFrame[]>> {
  return (async function* () {
    for (const page of pages) yield createResult(page)
  })()
}

function emptyBacklog(afterSequence = 0, selectedCursor: string | undefined = undefined) {
  return createResult({
    afterSequence,
    mode: "replay" as const,
    pages: backlogPages(),
    replayUpperBound: afterSequence,
    selectedCursor,
  })
}

function schedulerCreate(): TestScheduler {
  return new TestScheduler()
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

function parseFrame(chunk: Uint8Array): StreamSseFrame {
  const text = new TextDecoder().decode(chunk)
  const id = text.match(/^id: ([^\n]+)/m)?.[1] ?? ""
  const eventName = text.match(/^event: ([^\n]+)/m)?.[1] ?? ""
  const data = text.match(/^data: ([^\n]+)/m)?.[1] ?? "{}"
  return { data: JSON.parse(data), event: eventName as StreamSseFrame["event"], id }
}

function appForEvents(options: {
  backlogRead: typeof journalBacklogRead
  liveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
  scheduler?: TestScheduler
  connectionWriterCreate?: typeof streamSseConnectionWriterCreate
}) {
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
      identitySessionLoad: async () =>
        createResult({
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          id: "session-1",
          lastUsedAt: null,
          revokedAt: null,
          tokenHash: "token-hash",
          userId,
        } as never),
    }),
  )
  apiEventsRoutesAdd(api, {
    backlogRead: options.backlogRead,
    connectionWriterCreate: options.connectionWriterCreate,
    cursorCodec,
    liveSubscription: options.liveSubscription ?? streamLiveSubscriptionCreate(),
    now: () => options.scheduler?.currentTime ?? Date.now(),
    scheduler: options.scheduler,
  })
  app.route("/api", api)
  return app
}

function resetFrame(sequence: number): StreamSseFrame {
  const id = `cursor-${userId}-${sequence}`
  return {
    data: { asOfSequence: sequence, eventType: "reset", id, reason: "cursor-expired", sequence },
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
  expect(liveSubscription.subscriberCount(userId)).toBe(1)
  await response.body?.cancel()
  await flush()
  expect(liveSubscription.subscriberCount(userId)).toBe(0)
})

test("passes Last-Event-ID before after and isolates cursor errors to the authenticated user", async () => {
  const calls: Array<{ after?: unknown; lastEventId?: unknown; userId: unknown }> = []
  const liveSubscription = streamLiveSubscriptionCreate()
  const app = appForEvents({
    backlogRead: async (_dependencies, input) => {
      calls.push(input)
      if (input.lastEventId === "cross-user")
        return createResultErrorCode(
          "journalBacklogRead",
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

  liveSubscription.publish(userId, frame(1))
  liveSubscription.publish(userId, frame(2))
  const result = await reader.read()
  expect(parseFrame(result.value as Uint8Array).data.sequence).toBe(2)
  await reader.cancel()
})

test("subscribes before reading the backlog and returns one explicit reset frame", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  let subscribedDuringBacklog = false
  const app = appForEvents({
    backlogRead: async () => {
      subscribedDuringBacklog = liveSubscription.subscriberCount(userId) === 1
      liveSubscription.publish(userId, frame(1))
      return createResult({
        afterSequence: 0,
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
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return
  const first = await reader.read()
  const second = await reader.read()
  expect(subscribedDuringBacklog).toBe(true)
  expect(parseFrame(first.value as Uint8Array).data.sequence).toBe(1)
  expect(parseFrame(second.value as Uint8Array).event).toBe("reset")
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
  expect(liveSubscription.subscriberCount(userId)).toBe(0)
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

  const publish = journalPostCommitPublishCreate({ cursorCodec, liveSubscription })
  const published = await publish([
    {
      createdAt: new Date(),
      eventType: "delta",
      id: "database-event-1",
      payload: { delta: "published", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" },
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

test("disconnects when a live frame is invalid or belongs to another user", async () => {
  const invalidSubscription = streamLiveSubscriptionCreate()
  const invalidApp = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription: invalidSubscription,
  })
  const invalidResponse = await invalidApp.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const invalidReader = invalidResponse.body?.getReader()
  invalidSubscription.publish(userId, { data: {}, event: "delta", id: "invalid" } as never)
  try {
    await invalidReader?.read()
  } catch (_error) {
    // The invalid publication deliberately aborts the stream.
  }
  await flush()
  expect(invalidSubscription.subscriberCount(userId)).toBe(0)
  await invalidReader?.cancel().catch(() => undefined)

  const crossUserSubscription = streamLiveSubscriptionCreate()
  const crossUserApp = appForEvents({
    backlogRead: async () => emptyBacklog(),
    liveSubscription: crossUserSubscription,
  })
  const crossUserResponse = await crossUserApp.request("https://events.test/api/events", {
    headers: { Cookie: "__Host-codeline-session=session-token" },
  })
  const crossUserReader = crossUserResponse.body?.getReader()
  crossUserSubscription.publish(userId, frame(1, "cursor-other-user-1"))
  try {
    await crossUserReader?.read()
  } catch (_error) {
    // The cross-user publication deliberately aborts the stream.
  }
  await flush()
  expect(crossUserSubscription.subscriberCount(userId)).toBe(0)
  await crossUserReader?.cancel().catch(() => undefined)
})

test("requires the cursor dependency when constructing the authenticated events route", () => {
  const api = new Hono<AppEnvironment>()
  expect(() =>
    apiEventsRoutesAdd(api, {
      cursorCodec: undefined as never,
      liveSubscription: streamLiveSubscriptionCreate(),
    }),
  ).toThrow("cursor codec is required")
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
  liveSubscription.publish(userId, frame(1))
  scheduler.advance(15_000)
  await flush()
  expect(liveSubscription.subscriberCount(userId)).toBe(0)
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
        afterSequence: 0,
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
  liveSubscription.publish(userId, frame(500))
  liveSubscription.publish(userId, frame(1_101))
  liveSubscription.publish(userId, frame(1_101))
  expect(replayWriteInFlight).toBe(true)
  releaseFirstWrite()

  const sequences: number[] = []
  while (sequences.length < 1_101) {
    const result = await reader.read()
    expect(result.done).toBe(false)
    if (result.done || result.value === undefined) break
    sequences.push(parseFrame(result.value).data.sequence)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  expect(sequences).toEqual(Array.from({ length: 1_101 }, (_, index) => index + 1))
  expect(new Set(sequences).size).toBe(sequences.length)
  expect(maximumPageSize).toBeLessThanOrEqual(pageSize)
  expect(connection?.maximumReplayStagingEventCount()).toBeLessThanOrEqual(128)
  expect(connection?.maximumReplayStagingByteCount()).toBeLessThanOrEqual(1 * 1024 * 1024)
  await reader.cancel()
})
