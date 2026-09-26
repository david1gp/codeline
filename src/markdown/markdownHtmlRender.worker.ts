/// <reference lib="webworker" />

import { markdownHtmlRender } from "./markdownHtmlRender.js"
import type { MarkdownHtmlRenderRequest, MarkdownHtmlRenderResponse } from "./markdownHtmlRenderAsync.js"

const worker = self as unknown as DedicatedWorkerGlobalScope

worker.addEventListener("message", (event: MessageEvent<MarkdownHtmlRenderRequest>) => {
  try {
    const html = markdownHtmlRender(event.data.content)
    const response: MarkdownHtmlRenderResponse = { type: "success", id: event.data.id, html }
    worker.postMessage(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Markdown rendering failed."
    const response: MarkdownHtmlRenderResponse = {
      type: "error",
      id: event.data.id,
      errorMessage,
    }
    worker.postMessage(response)
  }
})
