import { expect, test } from "bun:test"
import { markdownLatestOnlySchedulerCreate } from "../src/markdown/markdownLatestOnlySchedulerCreate.js"

test("keeps one request in flight and coalesces pending values to the newest", async () => {
  const started: string[] = []
  const requests: Deferred<void>[] = []
  const scheduler = markdownLatestOnlySchedulerCreate<string, void>({
    run: (value) => {
      started.push(value)
      const request = deferredCreate<void>()
      requests.push(request)
      return request.promise
    },
  })

  scheduler.schedule("first")
  scheduler.schedule("second")
  scheduler.schedule("third")

  expect(started).toEqual(["first"])
  expect(scheduler.inFlight()).toBe(true)
  expect(scheduler.pending()).toBe(true)

  requests[0]?.resolve()
  await flush()

  expect(started).toEqual(["first", "third"])
  expect(scheduler.pending()).toBe(false)
  requests[1]?.resolve()
  await scheduler.idle()
})

test("reports successful completions in request order", async () => {
  const requests: Deferred<string>[] = []
  const completed: string[] = []
  const scheduler = markdownLatestOnlySchedulerCreate<string, string>({
    run: (value) => {
      const request = deferredCreate<string>()
      requests.push(request)
      return request.promise.then((result) => `${value}:${result}`)
    },
    onComplete: (_value, result) => completed.push(result),
  })

  scheduler.schedule("first")
  scheduler.schedule("latest")
  requests[0]?.resolve("done")
  await flush()
  requests[1]?.resolve("done")
  await scheduler.idle()

  expect(completed).toEqual(["first:done", "latest:done"])
})

test("continues with the newest pending value after a failure", async () => {
  const requests: Deferred<string>[] = []
  const failures: string[] = []
  const completed: string[] = []
  const scheduler = markdownLatestOnlySchedulerCreate<string, string>({
    run: (value) => {
      const request = deferredCreate<string>()
      requests.push(request)
      return request.promise.then((result) => `${value}:${result}`)
    },
    onComplete: (_value, result) => completed.push(result),
    onError: (error, value) => failures.push(`${value}:${String(error)}`),
  })

  scheduler.schedule("failed")
  scheduler.schedule("discarded")
  scheduler.schedule("continued")
  requests[0]?.reject("render failed")
  await flush()
  requests[1]?.resolve("done")
  await scheduler.idle()

  expect(failures).toEqual(["failed:render failed"])
  expect(completed).toEqual(["continued:done"])
})

test("continues with the newest pending value after a synchronous throw", async () => {
  const started: string[] = []
  const completed: string[] = []
  const failures: string[] = []
  const continued = deferredCreate<string>()
  let schedule: (value: string) => void = () => {}
  const scheduler = markdownLatestOnlySchedulerCreate<string, string>({
    run: (value) => {
      started.push(value)
      if (value === "failed") {
        schedule("discarded")
        schedule("continued")
        throw new Error("render failed")
      }
      if (value === "continued") return continued.promise
      return "discarded"
    },
    onComplete: (value, result) => completed.push(`${value}:${result}`),
    onError: (error, value) => failures.push(`${value}:${String(error)}`),
  })
  schedule = scheduler.schedule

  scheduler.schedule("failed")

  await flush()
  continued.resolve("done")
  await scheduler.idle()

  expect(started).toEqual(["failed", "continued"])
  expect(failures).toEqual(["failed:Error: render failed"])
  expect(completed).toEqual(["continued:done"])
})

test("disposal drops pending work and ignores later schedules", async () => {
  const requests: Deferred<void>[] = []
  const started: string[] = []
  const scheduler = markdownLatestOnlySchedulerCreate<string, void>({
    run: (value) => {
      started.push(value)
      const request = deferredCreate<void>()
      requests.push(request)
      return request.promise
    },
  })

  scheduler.schedule("active")
  scheduler.schedule("pending")
  scheduler.dispose()
  scheduler.schedule("after disposal")
  requests[0]?.resolve()
  await scheduler.idle()

  expect(started).toEqual(["active"])
  expect(scheduler.inFlight()).toBe(false)
  expect(scheduler.pending()).toBe(false)
})

test("does not publish a stale completion after disposal", async () => {
  const request = deferredCreate<string>()
  const completed: string[] = []
  const scheduler = markdownLatestOnlySchedulerCreate<string, string>({
    run: () => request.promise,
    onComplete: (_value, result) => completed.push(result),
  })

  scheduler.schedule("stale")
  scheduler.dispose()
  request.resolve("late result")
  await scheduler.idle()

  expect(completed).toEqual([])
})

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function deferredCreate<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => {}
  let rejectPromise: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
