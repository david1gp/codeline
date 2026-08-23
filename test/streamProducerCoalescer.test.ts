import { expect, test } from "bun:test"
import { streamProducerCoalescerCreate } from "../src/stream/actions/streamProducerCoalescerCreate.js"
import type { StreamProducerDelta } from "../src/stream/schema/streamProducerDeltaSchema.js"

type Timer = { callback: () => void; dueAt: number }

class TestScheduler {
  currentTime = 0
  private nextTimerId = 1
  private readonly timers = new Map<number, Timer>()

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === "number") this.timers.delete(handle)
  }

  setTimeout = (callback: () => void, timeoutMs: number): number => {
    const id = this.nextTimerId++
    this.timers.set(id, { callback, dueAt: this.currentTime + timeoutMs })
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
      this.timers.delete(id)
      timer.callback()
    }
  }

  timerCount = (): number => this.timers.size
}

function fragment(delta: string, overrides: Partial<StreamProducerDelta> = {}): StreamProducerDelta {
  return {
    delta,
    deltaKind: "text",
    messageId: "message-1",
    runId: "run-1",
    sessionId: "session-1",
    ...overrides,
  }
}

function coalescerCreate(
  scheduler: TestScheduler,
  flushed: StreamProducerDelta[],
  options: { flushIntervalMs?: number; serialize?: (event: StreamProducerDelta) => string } = {},
) {
  return streamProducerCoalescerCreate({
    onFlush: (event) => flushed.push(event),
    scheduler,
    ...options,
  })
}

test("flushes the first fragment immediately and coalesces each independent key", () => {
  const scheduler = new TestScheduler()
  const flushed: StreamProducerDelta[] = []
  const coalescer = coalescerCreate(scheduler, flushed)

  expect(coalescer.append(fragment("a"))).toMatchObject({ success: true })
  expect(coalescer.append(fragment("b"))).toMatchObject({ success: true })
  expect(coalescer.append(fragment("thinking", { deltaKind: "thinking" }))).toMatchObject({ success: true })
  expect(coalescer.append(fragment("other-message", { messageId: "message-2" }))).toMatchObject({ success: true })
  expect(coalescer.append(fragment("other-message-pending", { messageId: "message-2" }))).toMatchObject({
    success: true,
  })
  expect(flushed).toEqual([
    fragment("a"),
    fragment("thinking", { deltaKind: "thinking" }),
    fragment("other-message", { messageId: "message-2" }),
  ])
  expect(coalescer.pendingCount()).toBe(2)

  scheduler.advance(499)
  expect(flushed).toHaveLength(3)
  scheduler.advance(1)
  expect(flushed).toEqual([
    fragment("a"),
    fragment("thinking", { deltaKind: "thinking" }),
    fragment("other-message", { messageId: "message-2" }),
    fragment("b"),
    fragment("other-message-pending", { messageId: "message-2" }),
  ])
})

test("uses a configurable coalescing interval", () => {
  const scheduler = new TestScheduler()
  const flushed: StreamProducerDelta[] = []
  const coalescer = coalescerCreate(scheduler, flushed, { flushIntervalMs: 25 })

  coalescer.append(fragment("first"))
  coalescer.append(fragment("second"))
  scheduler.advance(24)
  expect(flushed).toHaveLength(1)
  scheduler.advance(1)
  expect(flushed).toHaveLength(2)
})

test("flushes the current key at the serialized-size boundary", () => {
  const scheduler = new TestScheduler()
  const flushed: StreamProducerDelta[] = []
  const coalescer = coalescerCreate(scheduler, flushed, {
    serialize: (event) => event.delta,
  })

  coalescer.append(fragment("first"))
  coalescer.append(fragment("second"))
  expect(coalescer.pendingCount()).toBe(1)
  expect(coalescer.append(fragment("x".repeat(128 * 1024)))).toMatchObject({ success: true })
  expect(flushed).toEqual([fragment("first"), fragment("second"), fragment("x".repeat(128 * 1024))])
  expect(coalescer.pendingCount()).toBe(0)
})

test("flushes all pending keys before a lifecycle event", () => {
  const scheduler = new TestScheduler()
  const flushed: StreamProducerDelta[] = []
  const coalescer = coalescerCreate(scheduler, flushed)

  coalescer.append(fragment("first"))
  coalescer.append(fragment("second"))
  coalescer.append(fragment("other", { runId: "run-2" }))
  coalescer.append(fragment("other-pending", { runId: "run-2" }))
  expect(coalescer.flushAll()).toMatchObject({ success: true })
  expect(coalescer.pendingCount()).toBe(0)
  expect(scheduler.timerCount()).toBe(0)
  expect(flushed).toEqual([
    fragment("first"),
    fragment("other", { runId: "run-2" }),
    fragment("second"),
    fragment("other-pending", { runId: "run-2" }),
  ])
  expect(coalescer.append(fragment("after-lifecycle"))).toMatchObject({ success: true })
  expect(coalescer.pendingCount()).toBe(0)
  expect(flushed.at(-1)?.delta).toBe("after-lifecycle")
})

test("enforces the 128 KiB serialized UTF-8 event limit", () => {
  const scheduler = new TestScheduler()
  const flushed: StreamProducerDelta[] = []
  const coalescer = coalescerCreate(scheduler, flushed, {
    serialize: (event) => event.delta,
  })

  expect(coalescer.append(fragment("😀".repeat(32_768)))).toMatchObject({ success: true })
  const rejected = coalescer.append(fragment("😀".repeat(32_769), { runId: "run-2" }))
  expect(rejected.success).toBe(false)
  if (!rejected.success) expect(rejected.errorMessage).toContain("128 KiB")
})
