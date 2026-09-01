import { expect, test } from "bun:test"
import { createResult, createResultErrorCode } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiSessionDetailEventsRoutesAdd } from "../src/session/api/apiSessionDetailEventsRoutesAdd.js"
import { sessionDetailPostCommitPublishCreate } from "../src/session/actions/sessionDetailPostCommitPublishCreate.js"
import { sessionDetailSseFrameSchema } from "../src/session/api/sessionDetailSseFrameSchema.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import type { SessionDetailSseFrame } from "../src/session/api/sessionDetailSseFrameSchema.js"

const userId = "session-detail-events-user"
const organizationId = "session-detail-events-organization"
const sessionId = "session-detail-events-session"

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

const cursorCodec = {
  encodeSessionPosition: (ownerUserId: unknown, ownerSessionId: unknown, changePosition: unknown) =>
    createResult(`session-cursor-${String(ownerUserId)}-${String(ownerSessionId)}-${String(changePosition)}`),
  validateSessionPosition: (cursor: unknown, ownerUserId: unknown, ownerSessionId: unknown) => {
    const prefix = `session-cursor-${String(ownerUserId)}-${String(ownerSessionId)}-`
    if (typeof cursor !== "string" || !cursor.startsWith(prefix))
      return createResultErrorCode("sessionCursorValidate", "The selected-session cursor is invalid.", "cursor_invalid")
    return createResult({
      changePosition: Number(cursor.slice(prefix.length)),
      sessionId: String(ownerSessionId),
      userId: String(ownerUserId),
      version: 1 as const,
    })
  },
} as unknown as JournalCursorCodec

function frame(
  changePosition: number,
  entryId = `entry-${changePosition}`,
  selectedSessionId = sessionId,
): SessionDetailSseFrame {
  const id = `session-cursor-${userId}-${selectedSessionId}-${changePosition}`
  return {
    data: {
      changePosition,
      entryId,
      eventType: "entry",
      id,
      kind: "run",
      payload: { id: entryId, status: "running" },
      position: changePosition,
      sessionId: selectedSessionId,
      sourceDetailId: "",
      sourceId: entryId,
      sourceType: "run",
    },
    event: "entry",
    id,
  }
}

function resetFrame(asOfPosition: number): SessionDetailSseFrame {
  const id = `session-cursor-${userId}-${sessionId}-${asOfPosition}`
  return {
    data: { asOfPosition, eventType: "reset", id, reason: "cursor-expired", sessionId },
    event: "reset",
    id,
  }
}

function pages(
  ...values: readonly SessionDetailSseFrame[][]
): AsyncIterable<ReturnType<typeof createResult<readonly SessionDetailSseFrame[]>>> {
  return (async function* () {
    for (const value of values) yield createResult(value)
  })()
}

function appCreate(
  backlogRead: Parameters<typeof apiSessionDetailEventsRoutesAdd>[1]["backlogRead"],
  liveSubscription = streamLiveSubscriptionCreate(),
) {
  const app = new Hono<AppEnvironment>()
  const api = new Hono<AppEnvironment>()
  const database = {} as never
  app.use("/api/*", async (context, next) => {
    context.set("database", database)
    if (context.req.header("Cookie") === undefined) {
      return context.json({ error: { code: "unauthorized", message: "Authentication is required." } }, 401)
    }
    context.set("requestIdentity", { organizationId, userId })
    return next()
  })
  const scheduler = new TestScheduler()
  apiSessionDetailEventsRoutesAdd(api, {
    backlogRead,
    connectionWriterCreate: streamSseConnectionWriterCreate,
    cursorCodec,
    liveSubscription,
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

test("requires authentication and isolates one selected-session channel from another", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const { app } = appCreate(
    async () =>
      createResult({
        afterChangePosition: 0,
        mode: "replay",
        pages: pages(),
        replayUpperBound: 0,
        selectedCursor: undefined,
      }),
    liveSubscription,
  )
  expect((await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`)).status).toBe(401)

  const response = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: { Cookie: "session-token" },
  })
  expect(response.status).toBe(200)
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return

  liveSubscription.selectedSessionDetailPublish(userId, "other-session", frame(1, "hidden", "other-session"))
  liveSubscription.globalSummaryPublish(userId, {} as never)
  liveSubscription.selectedSessionDetailPublish(userId, sessionId, frame(2))
  const received = await reader.read()
  expect(parseFrame(received.value as Uint8Array).data.entryId).toBe("entry-2")
  expect(liveSubscription.selectedSessionDetailSubscriberCount(userId, sessionId)).toBe(1)
  await reader.cancel()
  await flush()
  expect(liveSubscription.selectedSessionDetailSubscriberCount(userId, sessionId)).toBe(0)
})

test("replays selected projection changes in session changePosition order and preserves stable entry IDs", async () => {
  let input: unknown
  const first = frame(1, "stable-entry")
  const later = frame(3, "stable-entry")
  const { app } = appCreate(async (_database, backlogInput) => {
    input = backlogInput
    return createResult({
      afterChangePosition: 0,
      mode: "replay" as const,
      pages: pages([first, later]),
      replayUpperBound: 3,
      selectedCursor: undefined,
    })
  })
  const response = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: { Cookie: "session-token" },
  })
  const reader = response.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return
  const received: Array<ReturnType<typeof parseFrame>> = []
  while (received.length < 2) {
    const next = await reader.read()
    expect(next.done).toBe(false)
    if (next.done || next.value === undefined) break
    received.push(parseFrame(next.value))
  }
  expect(received.map((event) => event.data.changePosition)).toEqual([1, 3])
  expect(received.map((event) => event.data.entryId)).toEqual(["stable-entry", "stable-entry"])
  expect(input).toMatchObject({ sessionId, userId, organizationId })
  await reader.cancel()
})

test("uses a separate selected cursor and emits a reset for a future position", async () => {
  const { app } = appCreate(async () =>
    createResult({
      afterChangePosition: 99,
      mode: "reset" as const,
      pages: pages([resetFrame(4)]),
      replayUpperBound: 4,
      selectedCursor: "future",
    }),
  )
  const response = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: {
      Cookie: "session-token",
      "Last-Event-ID": `session-cursor-${userId}-${sessionId}-99`,
    },
  })
  expect(response.status).toBe(200)
  const resetReader = response.body?.getReader()
  const reset = await resetReader?.read()
  expect(reset?.value === undefined ? undefined : parseFrame(reset.value).data).toMatchObject({
    asOfPosition: 4,
    eventType: "reset",
    sessionId,
  })
  await resetReader?.cancel()
})

test("reconnects from the selected cursor and suppresses overlap by stable entry and change position", async () => {
  const first = frame(1, "reconnect-entry")
  const second = frame(2, "reconnect-entry")
  let reconnect = false
  const liveSubscription = streamLiveSubscriptionCreate()
  const { app } = appCreate(async (_database, input) => {
    reconnect = input.lastEventId !== undefined
    return createResult({
      afterChangePosition: reconnect ? 1 : 0,
      mode: "replay" as const,
      pages: pages(reconnect ? [second] : []),
      replayUpperBound: reconnect ? 2 : 0,
      selectedCursor: input.lastEventId as string | undefined,
    })
  }, liveSubscription)
  const firstResponse = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: { Cookie: "session-token" },
  })
  const firstReader = firstResponse.body?.getReader()
  expect(firstReader).toBeDefined()
  if (firstReader === undefined) return
  liveSubscription.selectedSessionDetailPublish(userId, sessionId, first)
  const firstRead = await firstReader.read()
  const firstId = parseFrame(firstRead.value as Uint8Array).id
  await firstReader.cancel()
  await flush()

  const secondResponse = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: { Cookie: "session-token", "Last-Event-ID": firstId },
  })
  const secondReader = secondResponse.body?.getReader()
  expect(secondReader).toBeDefined()
  if (secondReader === undefined) return
  liveSubscription.selectedSessionDetailPublish(userId, sessionId, second)
  liveSubscription.selectedSessionDetailPublish(userId, sessionId, second)
  const secondRead = await secondReader.read()
  expect(parseFrame(secondRead.value as Uint8Array).data.changePosition).toBe(2)
  expect(reconnect).toBe(true)
  await secondReader.cancel()
})

test("rejects a cursor belonging to another session before opening a selected stream", async () => {
  const liveSubscription = streamLiveSubscriptionCreate()
  const { app } = appCreate(async () => {
    throw new Error("backlog must not be read")
  }, liveSubscription)
  const response = await app.request(`https://session-detail.test/api/sessions/${sessionId}/events`, {
    headers: { Cookie: "session-token", "Last-Event-ID": "session-cursor-session-detail-events-user-other-session-1" },
  })
  expect(response.status).toBe(400)
  expect(liveSubscription.selectedSessionDetailSubscriberCount(userId, sessionId)).toBe(0)
})

test("keeps publication on the selected channel and never mixes globalSequence with changePosition", async () => {
  const entry = {
    changePosition: 7,
    createdAt: new Date(),
    id: "published-entry",
    kind: "run",
    payload: { id: "published-entry", status: "running" },
    position: 4,
    sessionId,
    sourceDetailId: "",
    sourceId: "published-run",
    sourceType: "run",
    updatedAt: new Date(),
    userId,
  }
  const database = {
    select: () => ({
      from: () => ({
        where: async () => [entry],
      }),
    }),
  } as never
  const liveSubscription = streamLiveSubscriptionCreate()
  const received: SessionDetailSseFrame[] = []
  const unsubscribe = liveSubscription.selectedSessionDetailSubscribe(userId, sessionId, (event) =>
    received.push(event),
  )
  const published = await sessionDetailPostCommitPublishCreate({
    cursorCodec,
    database,
    liveSubscription,
  })([
    {
      createdAt: new Date(),
      eventType: "run-started",
      id: "journal-event",
      payload: { runId: "published-run", sessionId },
      sequence: 91,
      serializedBytes: 1,
      userId,
    } as never,
  ])
  expect(published.success).toBe(true)
  expect(received).toHaveLength(1)
  expect(received[0]?.data).toMatchObject({ changePosition: 7, entryId: "published-entry", position: 4 })
  expect(received[0]?.data).not.toHaveProperty("globalSequence")
  unsubscribe()
})

test("enforces the complete selected-session frame limit", () => {
  const oversized = {
    data: {
      ...frame(1).data,
      payload: { content: "x".repeat(200_000) },
    },
    event: "entry" as const,
    id: frame(1).id,
  }
  expect(v.safeParse(sessionDetailSseFrameSchema, oversized).success).toBe(false)
})
