import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createEffect, onCleanup } from "solid-js"
import { markdownHtmlRenderAsync } from "../../markdown/markdownHtmlRenderAsync.js"

type MessageBodyRenderStateCreateOptions = {
  content: () => string
  renderHtml?: (content: string) => Promise<string>
}

export function messageBodyRenderStateCreate(options: MessageBodyRenderStateCreateOptions) {
  const renderedHtml = createSignalObject<string | undefined>(undefined)
  const renderHtml = options.renderHtml ?? markdownHtmlRenderAsync
  let contentVersion = 0
  let disposed = false

  createEffect(() => {
    const content = options.content()
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

  return { renderedHtml: renderedHtml.get }
}
