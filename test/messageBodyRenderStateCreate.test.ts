import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => import("solid-js/dist/solid.js"))
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    let current = value
    return { get: () => current, set: (next: T) => (current = next) }
  },
}))

const { messageBodyRenderStateCreate } = await import("../src/message/ui/messageBodyRenderStateCreate.js")

let previousWindow: typeof globalThis.window | undefined

beforeEach(() => {
  previousWindow = globalThis.window
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} })
})

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window")
    return
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow })
})

test("starts with no rendered HTML while the source fallback is pending", () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content: () => "Pending **source**",
      renderHtml: () => new Promise(() => {}),
    }),
  }))

  expect(root.state.renderedHtml()).toBeUndefined()
  root.dispose()
})

test("replaces the source fallback with successful asynchronous HTML", async () => {
  const deferred = deferredCreate()
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({ content: () => "Pending", renderHtml: () => deferred.promise }),
  }))

  await effectsFlush()
  expect(root.state.renderedHtml()).toBeUndefined()

  deferred.resolve("<p>Rendered</p>")
  await effectsFlush()

  expect(root.state.renderedHtml()).toBe("<p>Rendered</p>")
  root.dispose()
})

test("suppresses a stale response after the message content changes", async () => {
  const deferred = [] as Deferred[]
  const [content, contentSet] = createSignal("old source")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      renderHtml: () => {
        const next = deferredCreate()
        deferred.push(next)
        return next.promise
      },
    }),
  }))

  await effectsFlush()
  contentSet("new source")
  await effectsFlush()

  deferred[0]?.resolve("<p>Old</p>")
  await effectsFlush()
  expect(root.state.renderedHtml()).toBeUndefined()

  deferred[1]?.resolve("<p>New</p>")
  await effectsFlush()
  expect(root.state.renderedHtml()).toBe("<p>New</p>")
  root.dispose()
})

test("retains the source fallback when asynchronous rendering rejects", async () => {
  const deferred = deferredCreate()
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({ content: () => "Unrendered source", renderHtml: () => deferred.promise }),
  }))

  await effectsFlush()
  deferred.reject(new Error("worker failed"))
  await effectsFlush()

  expect(root.state.renderedHtml()).toBeUndefined()
  root.dispose()
})

test("ignores a late render result after the message body is disposed", async () => {
  const deferred = deferredCreate()
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({ content: () => "Disposed source", renderHtml: () => deferred.promise }),
  }))

  await effectsFlush()
  root.dispose()
  deferred.resolve("<p>Late result</p>")
  await effectsFlush()

  expect(root.state.renderedHtml()).toBeUndefined()
})

type Deferred = {
  promise: Promise<string>
  reject: (reason?: unknown) => void
  resolve: (value: string) => void
}

function deferredCreate(): Deferred {
  let resolvePromise: (value: string) => void = () => {}
  let rejectPromise: (reason?: unknown) => void = () => {}
  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

async function effectsFlush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
