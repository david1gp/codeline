import { expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"
import { serverShutdownCoordinatorCreate } from "../src/server/serverShutdownCoordinatorCreate.js"

function deferred<T>(): { promise: Promise<T>; reject: (error: unknown) => void; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, reject, resolve }
}

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
  const clearTimeout = (id: unknown): void => {
    if (typeof id === "number") timers.delete(id)
  }
  const advance = (durationMs: number): void => {
    currentTime += durationMs
    for (const [id, timer] of timers) {
      if (timer.timeoutAt > currentTime) continue
      timers.delete(id)
      timer.handler()
    }
  }

  return { advance, clearTimeout, setTimeout }
}

test("closes admission and aborts registered work on the first shutdown", async () => {
  const cleanup = deferred<void>()
  const coordinator = serverShutdownCoordinatorCreate({ deadlineMs: 100 })
  const providerController = new AbortController()
  const unregister = coordinator.register(providerController)

  expect(coordinator.admit()).toBe(true)
  expect(coordinator.signal.aborted).toBe(false)
  const first = coordinator.shutdown(() => cleanup.promise)
  const second = coordinator.shutdown(() => Promise.resolve())

  expect(second).toBe(first)
  expect(coordinator.admit()).toBe(false)
  expect(coordinator.signal.aborted).toBe(true)
  expect(providerController.signal.aborted).toBe(true)

  cleanup.resolve()
  expect((await first).success).toBe(true)
  unregister()
  unregister()
})

test("aborts a controller registered after admission closes", () => {
  const coordinator = serverShutdownCoordinatorCreate({ deadlineMs: 100 })
  void coordinator.shutdown(() => undefined)
  const controller = new AbortController()

  const unregister = coordinator.register(controller)

  expect(controller.signal.aborted).toBe(true)
  unregister()
})

test("settles at a controlled deadline and retains later cleanup diagnostics", async () => {
  const timer = controlledTimerCreate()
  const cleanup = deferred<void>()
  const coordinator = serverShutdownCoordinatorCreate({
    clearTimeout: timer.clearTimeout,
    deadlineMs: 25,
    setTimeout: timer.setTimeout,
  })

  const pending = coordinator.shutdown(() => cleanup.promise)
  expect(coordinator.shutdown(() => undefined)).toBe(pending)
  expect(coordinator.signal.aborted).toBe(true)
  timer.advance(24)
  await Promise.resolve()
  expect(coordinator.signal.aborted).toBe(true)

  timer.advance(1)
  const result = await pending
  expect(result.success).toBe(false)
  expect(result.diagnostics.deadlineExceeded).toBe(true)
  expect(result.diagnostics.errors).toEqual([expect.objectContaining({ phase: "deadline" })])

  const cleanupError = new Error("database close failed")
  cleanup.reject(cleanupError)
  await Promise.resolve()
  await Promise.resolve()
  expect(result.diagnostics.errors).toEqual([
    expect.objectContaining({ phase: "deadline" }),
    { error: cleanupError, phase: "cleanup" },
  ])
})

test("reports cleanup failure without forcing process exit", async () => {
  const timer = controlledTimerCreate()
  const cleanupError = new Error("server drain failed")
  const coordinator = serverShutdownCoordinatorCreate({
    clearTimeout: timer.clearTimeout,
    deadlineMs: 25,
    setTimeout: timer.setTimeout,
  })

  const result = await coordinator.shutdown(() => Promise.reject(cleanupError))
  timer.advance(25)

  expect(result.success).toBe(false)
  expect(result.diagnostics.deadlineExceeded).toBe(false)
  expect(result.diagnostics.errors).toEqual([{ error: cleanupError, phase: "cleanup" }])
})

test("application rejects new requests after shutdown admission closes", async () => {
  const coordinator = serverShutdownCoordinatorCreate({ deadlineMs: 100 })
  const app = appCreate({ shutdownCoordinator: coordinator })

  expect((await app.request("http://codeline.test/health")).status).toBe(200)
  const shutdown = coordinator.shutdown(() => undefined)
  expect((await app.request("http://codeline.test/health")).status).toBe(503)
  expect((await shutdown).success).toBe(true)
})
