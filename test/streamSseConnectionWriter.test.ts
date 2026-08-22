import { expect, test } from "bun:test"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import type { JournalEvent } from "../src/stream/schema/journalEventSchema.js"

type Timer = { callback: () => void; intervalMs: number; repeating: boolean; dueAt: number }

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

class TestWriter {
  readonly writes: string[] = []
  abortReasons: unknown[] = []
  closeCalls = 0
  blocked = false
  private pendingWrites: Array<() => void> = []

  abort = (reason?: unknown): void => {
    this.abortReasons.push(reason)
    this.releaseWrites()
  }

  close = (): void => {
    this.closeCalls += 1
  }

  releaseWrites = (): void => {
    const pending = this.pendingWrites.splice(0)
    for (const resolve of pending) resolve()
  }

  write = (chunk: Uint8Array): Promise<void> => {
    this.writes.push(new TextDecoder().decode(chunk))
    if (!this.blocked) return Promise.resolve()
    return new Promise<void>((resolve) => this.pendingWrites.push(resolve))
  }
}

function event(sequence: number, delta = `event-${sequence}`): JournalEvent {
  return {
    delta,
    deltaKind: "text",
    eventType: "delta",
    id: `event-${sequence}`,
    messageId: null,
    runId: "run-1",
    sequence,
    sessionId: "session-1",
  }
}

function connectionCreate(
  subscription: ReturnType<typeof streamLiveSubscriptionCreate>,
  scheduler: TestScheduler,
  writer: TestWriter,
  userId = "user-1",
  baselineSequence = 0,
) {
  return streamSseConnectionWriterCreate({
    baselineSequence,
    now: () => scheduler.currentTime,
    scheduler,
    subscription,
    userId,
    writer,
  })
}

async function drainMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

test("subscribes before backlog handoff and orders/deduplicates live and backlog events", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  subscription.publish("user-1", event(1, "live-first"))
  expect((await connection.enqueueBacklog([event(1), event(2)])).success).toBe(true)
  subscription.publish("user-1", event(3))
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()

  expect(writer.writes.map((frame) => JSON.parse(frame.split("data: ")[1]?.split("\n")[0] ?? "{}").id)).toEqual([
    "event-1",
    "event-2",
    "event-3",
  ])
})

test("accepts the validated frame shape returned by the journal backlog reader", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)
  const backlogFrame: StreamSseFrame = { data: { ...event(1), id: "cursor-1" }, event: "delta", id: "cursor-1" }

  expect(connection.connect().success).toBe(true)
  expect((await connection.enqueueBacklog([backlogFrame])).success).toBe(true)
  subscription.publish("user-1", backlogFrame)
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()

  expect(writer.writes.map((frame) => frame.match(/id: ([^\n]+)/)?.[1])).toEqual(["cursor-1"])
})

test("keeps later sequence events behind an in-flight earlier write", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect((await connection.enqueueBacklog([event(1), event(3)])).success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  subscription.publish("user-1", event(2))
  expect(writer.writes).toHaveLength(1)
  writer.releaseWrites()
  writer.blocked = false
  await drainMicrotasks()

  expect(writer.writes.map((frame) => frame.match(/id: ([^\n]+)/)?.[1])).toEqual(["event-1", "event-2", "event-3"])
})

test("drops a late lower sequence event while a higher sequence write is in flight", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  subscription.publish("user-1", event(2))
  subscription.publish("user-1", event(1))
  writer.blocked = false
  writer.releaseWrites()
  await connection.waitForIdle()

  expect(writer.writes.map((frame) => frame.match(/id: ([^\n]+)/)?.[1])).toEqual(["event-2"])
})

test("drains a replay larger than the live connection queue cap with bounded staging", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)
  const backlog = Array.from({ length: 1_025 }, (_, index) => event(index + 1))

  expect(connection.connect().success).toBe(true)
  const enqueue = connection.enqueueBacklog(backlog)
  await drainMicrotasks()
  expect(connection.queuedReplayEventCount()).toBeLessThanOrEqual(128)
  expect(connection.isDisconnected()).toBe(false)
  expect(writer.writes).toHaveLength(1)

  writer.blocked = false
  writer.releaseWrites()
  expect((await enqueue).success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()

  expect(writer.writes).toHaveLength(1_025)
  expect(writer.writes[0]?.match(/id: ([^\n]+)/)?.[1]).toBe("event-1")
  expect(writer.writes.at(-1)?.match(/id: ([^\n]+)/)?.[1]).toBe("event-1025")
})

test("does not replay live events at or below the authenticated cursor baseline", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer, "user-1", 5)

  expect(connection.connect().success).toBe(true)
  subscription.publish("user-1", event(4))
  subscription.publish("user-1", event(5))
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()

  expect(writer.writes).toHaveLength(0)
})

test("preserves a reset frame below a future cursor baseline", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer, "user-1", 5)
  const reset: StreamSseFrame = {
    data: { asOfSequence: 2, eventType: "reset", id: "reset-2", reason: "cursor-expired", sequence: 2 },
    event: "reset",
    id: "reset-2",
  }

  expect(connection.connect().success).toBe(true)
  expect((await connection.enqueueBacklog([reset])).success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()

  expect(writer.writes).toHaveLength(1)
  expect(writer.writes[0]).toContain("event: reset")
})

test("writes one event frame and emits an injectable fifteen-second heartbeat", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  scheduler.advance(14_999)
  await drainMicrotasks()
  expect(writer.writes).toHaveLength(0)
  scheduler.advance(1)
  await connection.waitForIdle()

  expect(writer.writes).toEqual([": heartbeat\n\n"])
})

test("disconnects and cleans up when the event-count queue overflows", () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  for (let sequence = 1; sequence <= 1_025; sequence += 1) subscription.publish("user-1", event(sequence))

  expect(connection.isDisconnected()).toBe(true)
  expect(connection.queuedEventCount()).toBe(0)
  expect(subscription.subscriberCount("user-1")).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
  expect(writer.abortReasons).toEqual(["connection-queue-event-overflow"])
})

test("disconnects and cleans up when queued frame bytes overflow", () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  for (let sequence = 1; sequence <= 20; sequence += 1)
    subscription.publish("user-1", event(sequence, "x".repeat(100_000)))

  expect(connection.isDisconnected()).toBe(true)
  expect(connection.queuedByteCount()).toBe(0)
  expect(writer.abortReasons).toEqual(["connection-queue-byte-overflow"])
})

test("disconnects a write that remains blocked for fifteen seconds", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  writer.blocked = true
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  subscription.publish("user-1", event(1))
  scheduler.advance(14_999)
  await drainMicrotasks()
  expect(connection.isDisconnected()).toBe(false)
  scheduler.advance(1)
  await connection.waitForIdle()

  expect(connection.isDisconnected()).toBe(true)
  expect(writer.abortReasons).toEqual(["blocked-or-failed-write"])
})

test("preserves available events across intentional sequence gaps", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect((await connection.enqueueBacklog([event(1), event(3)])).success).toBe(true)
  expect(connection.completeBacklog().success).toBe(true)
  await connection.waitForIdle()
  subscription.publish("user-1", event(5))
  await connection.waitForIdle()

  expect(writer.writes.map((frame) => frame.match(/id: ([^\n]+)/)?.[1])).toEqual(["event-1", "event-3", "event-5"])
})

test("rejects an oversized complete SSE frame and unsubscribes exactly once", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  const result = await connection.enqueueBacklog([event(1, "x".repeat(200_000))])
  expect(result.success).toBe(false)
  expect(connection.isDisconnected()).toBe(true)
  expect(subscription.subscriberCount("user-1")).toBe(0)
  await connection.disconnect("ignored")
  expect(writer.abortReasons).toEqual(["connection-frame-invalid"])
})

test("fans out only to the matching user and removes subscriptions on disconnect", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writerA = new TestWriter()
  const writerB = new TestWriter()
  const connectionA = connectionCreate(subscription, scheduler, writerA, "user-a")
  const connectionB = connectionCreate(subscription, scheduler, writerB, "user-b")

  expect(connectionA.connect().success).toBe(true)
  expect(connectionB.connect().success).toBe(true)
  expect(connectionA.completeBacklog().success).toBe(true)
  expect(connectionB.completeBacklog().success).toBe(true)
  subscription.publish("user-a", event(1))
  await Promise.all([connectionA.waitForIdle(), connectionB.waitForIdle()])
  expect(writerA.writes).toHaveLength(1)
  expect(writerB.writes).toHaveLength(0)

  await connectionA.disconnect("test-cleanup")
  await connectionB.disconnect("test-cleanup")
  expect(subscription.subscriberCount("user-a")).toBe(0)
  expect(subscription.subscriberCount("user-b")).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
})

test("aborts once and removes the subscription when the client disconnects", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  expect(subscription.subscriberCount("user-1")).toBe(1)
  await connection.disconnect("client-aborted")
  await connection.disconnect("ignored")
  subscription.publish("user-1", event(1))

  expect(writer.abortReasons).toEqual(["client-aborted"])
  expect(writer.writes).toHaveLength(0)
  expect(subscription.subscriberCount("user-1")).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
})

test("closes once and cleans up the subscription and heartbeat timer", async () => {
  const subscription = streamLiveSubscriptionCreate()
  const scheduler = new TestScheduler()
  const writer = new TestWriter()
  const connection = connectionCreate(subscription, scheduler, writer)

  expect(connection.connect().success).toBe(true)
  await connection.close()
  await connection.close()

  expect(writer.closeCalls).toBe(1)
  expect(writer.abortReasons).toHaveLength(0)
  expect(subscription.subscriberCount("user-1")).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
})
