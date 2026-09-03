import { expect, test } from "bun:test"
import { createResultError } from "@adaptive-ds/result"
import { journalEventsPruneSchedulerCreate } from "../src/journal/actions/journalEventsPruneSchedulerCreate.js"

function controlledTimerCreate() {
  let currentTime = 0
  let nextId = 0
  const timers = new Map<number, { handler: () => void; timeoutAt: number }>()

  const setTimeout = (handler: () => void, timeoutMs: number): number => {
    const id = nextId
    nextId += 1
    timers.set(id, { handler, timeoutAt: currentTime + timeoutMs })
    return id
  }

  const clearTimeout = (handle: unknown): void => {
    if (typeof handle === "number") timers.delete(handle)
  }

  const advance = (durationMs: number): void => {
    currentTime += durationMs
    for (const [id, timer] of [...timers]) {
      if (timer.timeoutAt > currentTime) continue
      timers.delete(id)
      timer.handler()
    }
  }

  return { advance, clearTimeout, currentTime: () => currentTime, pendingCount: () => timers.size, setTimeout }
}

function deferredCreate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test("retains a request during an active prune until the cooldown boundary", async () => {
  const timer = controlledTimerCreate()
  const calls: string[] = []
  const firstStarted = deferredCreate()
  const firstReleased = deferredCreate()
  const scheduler = journalEventsPruneSchedulerCreate({
    clearTimeout: timer.clearTimeout,
    clock: () => new Date(timer.currentTime()),
    cooldownMs: 100,
    database: {} as never,
    logError: () => undefined,
    prune: async (_dependencies, input) => {
      calls.push(input.userId)
      if (calls.length === 1) {
        firstStarted.resolve()
        await firstReleased.promise
      }
      return createResultError("journalEventsPruneSchedulerTest", "expected prune failure")
    },
    setTimeout: timer.setTimeout,
  })

  scheduler.schedule(["user-a"])
  await firstStarted.promise
  timer.advance(25)
  scheduler.schedule(["user-a"])
  expect(timer.pendingCount()).toBe(1)

  firstReleased.resolve()
  await scheduler.flush()
  expect(calls).toEqual(["user-a"])

  timer.advance(74)
  await scheduler.flush()
  expect(calls).toEqual(["user-a"])
  timer.advance(1)
  await scheduler.flush()
  expect(calls).toEqual(["user-a", "user-a"])
  await scheduler.drain()
})

test("coalesces repeated requests onto one deferred timer", async () => {
  const timer = controlledTimerCreate()
  let calls = 0
  const scheduler = journalEventsPruneSchedulerCreate({
    clearTimeout: timer.clearTimeout,
    clock: () => new Date(timer.currentTime()),
    cooldownMs: 100,
    database: {} as never,
    logError: () => undefined,
    prune: async () => {
      calls += 1
      return createResultError("journalEventsPruneSchedulerTest", "expected prune failure")
    },
    setTimeout: timer.setTimeout,
  })

  scheduler.schedule(["user-a"])
  await scheduler.flush()
  timer.advance(20)
  scheduler.schedule(["user-a"])
  scheduler.schedule(["user-a", "user-a"])
  expect(calls).toBe(1)
  expect(timer.pendingCount()).toBe(1)

  timer.advance(79)
  await scheduler.flush()
  expect(calls).toBe(1)
  timer.advance(1)
  await scheduler.flush()
  expect(calls).toBe(2)
  await scheduler.drain()
})

test("cleans idle state at the cooldown boundary", async () => {
  const timer = controlledTimerCreate()
  const scheduler = journalEventsPruneSchedulerCreate({
    clearTimeout: timer.clearTimeout,
    clock: () => new Date(timer.currentTime()),
    cooldownMs: 100,
    database: {} as never,
    logError: () => undefined,
    prune: async () => createResultError("journalEventsPruneSchedulerTest", "expected prune failure"),
    setTimeout: timer.setTimeout,
  })

  scheduler.schedule(["user-a"])
  await scheduler.flush()
  expect(scheduler.trackedUserCount()).toBe(1)
  timer.advance(100)
  expect(scheduler.trackedUserCount()).toBe(0)
  await scheduler.drain()
})

test("isolates prune failures while draining the deferred trailing run", async () => {
  const timer = controlledTimerCreate()
  const logMessages: string[] = []
  const firstStarted = deferredCreate()
  const firstReleased = deferredCreate()
  let calls = 0
  const scheduler = journalEventsPruneSchedulerCreate({
    clearTimeout: timer.clearTimeout,
    clock: () => new Date(timer.currentTime()),
    cooldownMs: 100,
    database: {} as never,
    logError: (message) => logMessages.push(message),
    prune: async () => {
      calls += 1
      if (calls === 1) {
        firstStarted.resolve()
        await firstReleased.promise
        throw new Error("first prune failed")
      }
      return createResultError("journalEventsPruneSchedulerTest", "second prune failed")
    },
    setTimeout: timer.setTimeout,
  })

  scheduler.schedule(["user-a"])
  await firstStarted.promise
  timer.advance(10)
  scheduler.schedule(["user-a"])
  firstReleased.resolve()
  await scheduler.flush()
  timer.advance(90)
  await scheduler.drain()

  expect(calls).toBe(2)
  expect(logMessages).toHaveLength(2)
  scheduler.schedule(["user-a"])
  expect(calls).toBe(2)
})
