import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createEffect, onCleanup } from "solid-js"
import { markdownHtmlRenderAsync } from "../../markdown/markdownHtmlRenderAsync.js"

type MessageBodyRenderStateCreateOptions = {
  content: () => string
  isStreaming?: () => boolean
  messageId?: () => string
  renderHtml?: (content: string) => Promise<string>
}

type MessageBodyRenderSnapshot = {
  content: string
  isStreaming: boolean
  messageId: string | undefined
}

function messageBodyRenderAppendOnlyEligible(
  previous: MessageBodyRenderSnapshot | undefined,
  next: MessageBodyRenderSnapshot,
): boolean {
  // A missing or changed identity makes the source a new document, even when its
  // text happens to share a prefix with the previous render.
  if (previous === undefined) return false
  if (!next.isStreaming || !previous.isStreaming) return false
  if (next.messageId === undefined || next.messageId !== previous.messageId) return false
  return next.content.startsWith(previous.content)
}

export function messageBodyRenderStateCreate(options: MessageBodyRenderStateCreateOptions) {
  const renderedHtml = createSignalObject<string | undefined>(undefined)
  const appendOnly = createSignalObject(false)
  const renderHtml = options.renderHtml ?? markdownHtmlRenderAsync
  let contentVersion = 0
  let disposed = false
  let previous: MessageBodyRenderSnapshot | undefined

  createEffect(() => {
    const content = options.content()
    const snapshot = {
      content,
      isStreaming: options.isStreaming?.() ?? false,
      messageId: options.messageId?.(),
    }
    appendOnly.set(messageBodyRenderAppendOnlyEligible(previous, snapshot))
    previous = snapshot
    const version = ++contentVersion
    renderedHtml.set(undefined)
    if (typeof window === "undefined") return

    try {
      void renderHtml(content)
        .then((html) => {
          if (disposed || version !== contentVersion) return
          renderedHtml.set(html)
        })
        .catch(() => undefined)
    } catch {
      return
    }
  })

  onCleanup(() => {
    disposed = true
    contentVersion += 1
  })

  return { appendOnly: appendOnly.get, renderedHtml: renderedHtml.get }
}
