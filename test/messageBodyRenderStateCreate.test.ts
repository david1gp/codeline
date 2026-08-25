import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { markdownHtmlRender } from "../src/markdown/markdownHtmlRender.js"

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
  const deferred = [] as Deferred<string>[]
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

test("coalesces streaming updates and publishes only the latest completion", async () => {
  const requests: Deferred<string>[] = []
  const started: string[] = []
  const [content, contentSet] = createSignal("first")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: (value) => {
        started.push(value)
        const request = deferredCreate<string>()
        requests.push(request)
        return request.promise
      },
    }),
  }))

  await effectsFlush()
  contentSet("second")
  await effectsFlush()
  contentSet("latest")
  await effectsFlush()

  expect(started).toEqual(["first"])
  requests[0]?.resolve("<p>First</p>")
  await effectsFlush()

  expect(started).toEqual(["first", "latest"])
  expect(root.state.renderedHtml()).toBeUndefined()
  requests[1]?.resolve("<p>Latest</p>")
  await effectsFlush()

  expect(root.state.renderedHtml()).toBe("<p>Latest</p>")
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

test("retains the newest source fallback when the coalesced render rejects", async () => {
  const requests: Deferred<string>[] = []
  const [content, contentSet] = createSignal("first source")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: () => {
        const request = deferredCreate<string>()
        requests.push(request)
        return request.promise
      },
    }),
  }))

  await effectsFlush()
  contentSet("latest source")
  await effectsFlush()
  requests[0]?.resolve("<p>First</p>")
  await effectsFlush()
  requests[1]?.reject(new Error("worker failed"))
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

test("marks an identified streaming message append as eligible", async () => {
  const [content, contentSet] = createSignal("stream")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: async () => "<p>Rendered</p>",
    }),
  }))

  await effectsFlush()
  expect(root.state.appendOnly()).toBe(false)

  contentSet("streamed")
  await effectsFlush()

  expect(root.state.appendOnly()).toBe(true)
  root.dispose()
})

test("renders the baseline as a document and reuses exact stable append fragments", async () => {
  const started: string[] = []
  const [content, contentSet] = createSignal("# Title")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: async (value) => {
        started.push(value)
        return markdownHtmlRender(value)
      },
    }),
  }))

  await effectsFlush()
  expect(started).toEqual(["# Title"])
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender("# Title"))

  const firstAppend = "# Title\n\nfirst\n\n"
  contentSet(firstAppend)
  await effectsFlush()
  expect(started).toEqual(["# Title", "# Title\n\n", "first\n\n"])
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(firstAppend))

  const secondAppend = `${firstAppend}second`
  contentSet(secondAppend)
  await effectsFlush()
  expect(started).toEqual(["# Title", "# Title\n\n", "first\n\n", "second"])
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(secondAppend))
  root.dispose()
})

test("renders character-by-character streamed content with scheduled projections", async () => {
  const started: string[] = []
  const initialRender = deferredCreate<string>()
  const source = "# Title\n\nfirst paragraph.\n\n- one\n\n> quoted\n\nSubtitle\n---\n\n"
  const [content, contentSet] = createSignal("")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: (value) => {
        started.push(value)
        if (value === "") return initialRender.promise
        return Promise.resolve(markdownHtmlRender(value))
      },
    }),
  }))

  await effectsFlush()
  for (let end = 1; end <= source.length; end += 1) {
    contentSet(source.slice(0, end))
    await effectsFlush()
  }

  expect(started).toEqual([""])
  expect(root.state.appendOnly()).toBe(true)
  expect(root.state.renderedHtml()).toBeUndefined()

  initialRender.resolve(markdownHtmlRender(""))
  await effectsFlush()
  await effectsFlush()

  expect(started).toContain("# Title\n\n")
  expect(started).toContain("first paragraph.\n\n")
  expect(started).toContain("- one\n\n")
  expect(started).toContain("> quoted\n\n")
  expect(started).toContain("Subtitle\n---\n\n")
  expect(started).not.toContain(source)
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(source))
  root.dispose()
})

test("renders the whole document after a non-append edit invalidates reused stable blocks", async () => {
  const started: string[] = []
  const initialSource = "# Title"
  const firstAppend = `${initialSource}\n\nfirst\n\n`
  const reusedSource = `${firstAppend}second`
  const editedSource = "# Title\n\nrewritten\n\nsecond"
  const [content, contentSet] = createSignal(initialSource)
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: async (value) => {
        started.push(value)
        return markdownHtmlRender(value)
      },
    }),
  }))

  await effectsFlush()
  contentSet(firstAppend)
  await effectsFlush()
  contentSet(reusedSource)
  await effectsFlush()

  expect(started).toEqual([initialSource, "# Title\n\n", "first\n\n", "second"])
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(reusedSource))

  contentSet(editedSource)
  await effectsFlush()

  expect(root.state.appendOnly()).toBe(false)
  expect(started.at(-1)).toBe(editedSource)
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(editedSource))
  root.dispose()
})

test("falls back to one whole-document render for non-append and invalidated updates", async () => {
  const started: string[] = []
  const [content, contentSet] = createSignal("before")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: async (value) => {
        started.push(value)
        return markdownHtmlRender(value)
      },
    }),
  }))

  await effectsFlush()
  contentSet("replacement")
  await effectsFlush()
  const tableSource = "replacement\n\n| name | value |\n| --- | --- |\n| one | two |"
  contentSet(tableSource)
  await effectsFlush()

  expect(started).toEqual(["before", "replacement", tableSource])
  expect(root.state.renderedHtml()).toBe(markdownHtmlRender(tableSource))
  root.dispose()
})

test("keeps the source fallback and does not cache partial fragment failures", async () => {
  const started: string[] = []
  const [content, contentSet] = createSignal("before")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: async (value) => {
        started.push(value)
        if (value === "before\n\n") throw new Error("stable block failed")
        return markdownHtmlRender(value)
      },
    }),
  }))

  await effectsFlush()
  contentSet("before\n\nfirst")
  await effectsFlush()

  expect(started).toEqual(["before", "before\n\n", "first"])
  expect(root.state.renderedHtml()).toBeUndefined()
  root.dispose()
})

test("disposes the scheduler and drops pending renders with the message body", async () => {
  const requests: Deferred<string>[] = []
  const started: string[] = []
  const [content, contentSet] = createSignal("active")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      messageId: () => "message-1",
      renderHtml: (value) => {
        started.push(value)
        const request = deferredCreate<string>()
        requests.push(request)
        return request.promise
      },
    }),
  }))

  await effectsFlush()
  contentSet("pending")
  await effectsFlush()
  root.dispose()
  requests[0]?.resolve("<p>Active</p>")
  await effectsFlush()

  expect(started).toEqual(["active"])
  expect(root.state.renderedHtml()).toBeUndefined()
})

test("rejects append eligibility for a new message, replacement, or finalized source", async () => {
  const [content, contentSet] = createSignal("stream")
  const [messageId, messageIdSet] = createSignal("message-1")
  const [isStreaming, isStreamingSet] = createSignal(true)
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming,
      messageId,
      renderHtml: async () => "<p>Rendered</p>",
    }),
  }))

  await effectsFlush()
  contentSet("streamed")
  await effectsFlush()
  expect(root.state.appendOnly()).toBe(true)

  contentSet("rewritten")
  await effectsFlush()
  expect(root.state.appendOnly()).toBe(false)

  contentSet("rewritten again")
  messageIdSet("message-2")
  await effectsFlush()
  expect(root.state.appendOnly()).toBe(false)

  messageIdSet("message-2")
  isStreamingSet(false)
  contentSet("rewritten again and finalized")
  await effectsFlush()
  expect(root.state.appendOnly()).toBe(false)
  root.dispose()
})

test("does not treat an unidentifiable stream as append-only", async () => {
  const [content, contentSet] = createSignal("stream")
  const root = createRoot((dispose) => ({
    dispose,
    state: messageBodyRenderStateCreate({
      content,
      isStreaming: () => true,
      renderHtml: async () => "<p>Rendered</p>",
    }),
  }))

  await effectsFlush()
  contentSet("streamed")
  await effectsFlush()

  expect(root.state.appendOnly()).toBe(false)
  root.dispose()
})

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function deferredCreate<T = string>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => {}
  let rejectPromise: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

async function effectsFlush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
