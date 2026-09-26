export type MarkdownHtmlRenderRequestId = number & {
  readonly __markdownHtmlRenderRequestId: unique symbol
}

export type MarkdownHtmlRenderRequest = {
  id: MarkdownHtmlRenderRequestId
  content: string
}

export type MarkdownHtmlRenderResponse =
  | { type: "success"; id: MarkdownHtmlRenderRequestId; html: string }
  | { type: "error"; id: MarkdownHtmlRenderRequestId; errorMessage: string }

type MarkdownHtmlRenderPending = {
  resolve: (html: string) => void
  reject: (error: Error) => void
}

let sharedWorker: Worker | undefined
let sharedWorkerUnavailableError: Error | undefined
let nextRequestId = 0
const pendingRequests = new Map<MarkdownHtmlRenderRequestId, MarkdownHtmlRenderPending>()

export function markdownHtmlRenderAsync(content: string): Promise<string> {
  const worker = markdownHtmlRenderWorkerResolve()
  if (worker === undefined) {
    return Promise.reject(sharedWorkerUnavailableError ?? new Error("Markdown rendering is unavailable."))
  }

  nextRequestId += 1
  const id = nextRequestId as MarkdownHtmlRenderRequestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    try {
      const request: MarkdownHtmlRenderRequest = { id, content }
      worker.postMessage(request)
    } catch (error) {
      pendingRequests.delete(id)
      reject(markdownHtmlRenderErrorResolve(error))
    }
  })
}

function markdownHtmlRenderWorkerResolve(): Worker | undefined {
  if (sharedWorker !== undefined) return sharedWorker
  if (sharedWorkerUnavailableError !== undefined) return
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    sharedWorkerUnavailableError = new Error("Markdown rendering is unavailable outside the browser.")
    return
  }

  try {
    const worker = new Worker(new URL("./markdownHtmlRender.worker.ts", import.meta.url), { type: "module" })
    worker.addEventListener("message", (event: MessageEvent<MarkdownHtmlRenderResponse>) => {
      markdownHtmlRenderResponseHandle(event.data)
    })
    worker.addEventListener("error", (event) => {
      markdownHtmlRenderWorkerFailureHandle(worker, event.error ?? new Error(event.message))
    })
    worker.addEventListener("messageerror", () => {
      markdownHtmlRenderWorkerFailureHandle(worker, new Error("Markdown worker transport failed."))
    })
    sharedWorker = worker
    return worker
  } catch (error) {
    sharedWorkerUnavailableError = markdownHtmlRenderErrorResolve(error)
    return
  }
}

function markdownHtmlRenderResponseHandle(response: MarkdownHtmlRenderResponse): void {
  const pending = pendingRequests.get(response.id)
  if (pending === undefined) return
  pendingRequests.delete(response.id)
  if (response.type === "success") {
    pending.resolve(response.html)
    return
  }
  pending.reject(new Error(response.errorMessage))
}

function markdownHtmlRenderWorkerFailureHandle(worker: Worker, error: unknown): void {
  if (sharedWorker !== worker) return
  sharedWorker = undefined
  const workerError = markdownHtmlRenderErrorResolve(error)
  for (const pending of pendingRequests.values()) pending.reject(workerError)
  pendingRequests.clear()
  worker.terminate()
}

function markdownHtmlRenderErrorResolve(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error("Markdown rendering failed.")
}
