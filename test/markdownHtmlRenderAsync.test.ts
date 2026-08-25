import { afterEach, expect, test } from "bun:test"
import type {
  MarkdownHtmlRenderRequest,
  MarkdownHtmlRenderRequestId,
  MarkdownHtmlRenderResponse,
} from "../src/markdown/markdownHtmlRenderAsync.js"
import { markdownHtmlRenderAsync } from "../src/markdown/markdownHtmlRenderAsync.js"

const previousWindow = globalThis.window
const previousWorker = globalThis.Worker

afterEach(() => {
  if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window")
  else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow })
  if (previousWorker === undefined) Reflect.deleteProperty(globalThis, "Worker")
  else Object.defineProperty(globalThis, "Worker", { configurable: true, value: previousWorker })
})

test("routes worker responses by request ID and falls back on protocol or transport errors", async () => {
  TestWorker.instances = []
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} })
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: TestWorker })

  const first = markdownHtmlRenderAsync("first")
  const second = markdownHtmlRenderAsync("second")
  const worker = TestWorker.instances[0]
  if (worker === undefined) throw new Error("Expected a Markdown worker.")

  expect(worker.posted.map((request) => request.content)).toEqual(["first", "second"])
  worker.respond({ type: "success", id: worker.posted[1]?.id as MarkdownHtmlRenderRequestId, html: "second HTML" })
  expect(await second).toBe("second HTML")

  worker.respond({ type: "success", id: 999 as MarkdownHtmlRenderRequestId, html: "unknown HTML" })
  worker.respond({ type: "success", id: worker.posted[0]?.id as MarkdownHtmlRenderRequestId, html: "first HTML" })
  expect(await first).toBe("first HTML")

  const protocolFailure = markdownHtmlRenderAsync("protocol failure")
  const protocolRequest = worker.posted[2]
  if (protocolRequest === undefined) throw new Error("Expected the protocol request.")
  worker.respond({ type: "error", id: protocolRequest.id, errorMessage: "parse failed" })
  await expect(protocolFailure).rejects.toThrow("parse failed")

  const transportFailure = markdownHtmlRenderAsync("transport failure")
  worker.fail(new Error("worker stopped"))
  await expect(transportFailure).rejects.toThrow("worker stopped")
  expect(worker.terminated).toBe(true)

  const replacement = markdownHtmlRenderAsync("replacement worker")
  const replacementWorker = TestWorker.instances[1]
  if (replacementWorker === undefined) throw new Error("Expected a replacement Markdown worker.")
  const replacementRequest = replacementWorker.posted[0]
  if (replacementRequest === undefined) throw new Error("Expected the replacement request.")
  replacementWorker.respond({ type: "success", id: replacementRequest.id, html: "replacement HTML" })
  expect(await replacement).toBe("replacement HTML")
  replacementWorker.fail(new Error("test cleanup"))
})

class TestWorker {
  static instances: TestWorker[] = []
  readonly posted: MarkdownHtmlRenderRequest[] = []
  private readonly errorListeners: Array<(event: ErrorEvent) => void> = []
  private readonly messageListeners: Array<(event: MessageEvent<MarkdownHtmlRenderResponse>) => void> = []
  private isTerminated = false

  get terminated(): boolean {
    return this.isTerminated
  }

  constructor(_url: string | URL, _options?: WorkerOptions) {
    TestWorker.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== "function") return
    if (type === "message") {
      this.messageListeners.push(listener as (event: MessageEvent<MarkdownHtmlRenderResponse>) => void)
      return
    }
    if (type === "error") this.errorListeners.push(listener as (event: ErrorEvent) => void)
  }

  postMessage(message: unknown): void {
    this.posted.push(message as MarkdownHtmlRenderRequest)
  }

  respond(response: MarkdownHtmlRenderResponse): void {
    if (this.isTerminated) return
    const event = { data: response } as MessageEvent<MarkdownHtmlRenderResponse>
    for (const listener of this.messageListeners) listener(event)
  }

  fail(error: Error): void {
    const event = { error, message: error.message } as ErrorEvent
    for (const listener of this.errorListeners) listener(event)
  }

  terminate(): void {
    this.isTerminated = true
  }
}
