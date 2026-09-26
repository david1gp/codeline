import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createEffect, onCleanup } from "solid-js"
import { markdownBlockCacheCreate } from "../../markdown/markdownBlockCacheCreate.js"
import { markdownHtmlRenderAsync } from "../../markdown/markdownHtmlRenderAsync.js"
import { markdownLatestOnlySchedulerCreate } from "../../markdown/markdownLatestOnlySchedulerCreate.js"
import { markdownStreamingProjectionCreate } from "../../markdown/markdownStreamingProjectionCreate.js"

type MessageBodyRenderStateCreateOptions = {
  content: () => string
  isStreaming?: () => boolean
  messageId?: () => string | undefined
  renderHtml?: (content: string) => Promise<string>
}

type MessageBodyRenderSnapshot = {
  content: string
  isStreaming: boolean
  messageId: string | undefined
}

type MessageBodyRenderRequest = MessageBodyRenderSnapshot & {
  appendOnly: boolean
  previousContent: string | undefined
  version: number
}

type MessageBodyRenderCacheKey = {
  ownerIdentity: string
  blockIdentity: string
  blockType: string
  rawContent: string
  rendererVersion: string
}

type MessageBodyRenderCacheEntry = {
  key: MessageBodyRenderCacheKey
  html: string
}

type MessageBodyRenderResult = {
  html: string
  cacheEntries: MessageBodyRenderCacheEntry[]
}

const messageBodyRenderCacheMaxEntries = 128
const messageBodyRenderRendererVersion = "micromark-safe-v1"

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
  const blockCache = markdownBlockCacheCreate({ maxEntries: messageBodyRenderCacheMaxEntries })
  let contentVersion = 0
  let disposed = false
  let previous: MessageBodyRenderSnapshot | undefined
  const scheduler = markdownLatestOnlySchedulerCreate<MessageBodyRenderRequest, MessageBodyRenderResult>({
    onComplete: (request, result) => {
      if (disposed || request.version !== contentVersion) return
      for (const entry of result.cacheEntries) blockCache.set(entry.key, entry.html)
      renderedHtml.set(result.html)
    },
    run: (request) => messageBodyRenderRequestRender(request, renderHtml, blockCache),
  })

  createEffect(() => {
    const content = options.content()
    const snapshot = {
      content,
      isStreaming: options.isStreaming?.() ?? false,
      messageId: options.messageId?.(),
    }
    const previousContent = previous?.content
    const isAppendOnly = messageBodyRenderAppendOnlyEligible(previous, snapshot)
    appendOnly.set(isAppendOnly)
    previous = snapshot
    const version = ++contentVersion
    renderedHtml.set(undefined)
    if (typeof window === "undefined") return
    scheduler.schedule({ ...snapshot, appendOnly: isAppendOnly, previousContent, version })
  })

  onCleanup(() => {
    disposed = true
    contentVersion += 1
    scheduler.dispose()
    blockCache.dispose()
  })

  return { appendOnly: appendOnly.get, renderedHtml: renderedHtml.get }
}

async function messageBodyRenderRequestRender(
  request: MessageBodyRenderRequest,
  renderHtml: (content: string) => Promise<string>,
  blockCache: ReturnType<typeof markdownBlockCacheCreate>,
): Promise<MessageBodyRenderResult> {
  if (!request.appendOnly || request.previousContent === undefined || request.messageId === undefined)
    return { html: await renderHtml(request.content), cacheEntries: [] }

  const projection = markdownStreamingProjectionCreate(request.content, {
    appendOnly: true,
    previousSource: request.previousContent,
  })
  if (projection.wholeDocumentFallback) return { html: await renderHtml(request.content), cacheEntries: [] }

  const stableHtml: (string | undefined)[] = []
  const stableMisses: {
    index: number
    key: MessageBodyRenderCacheKey
    raw: string
  }[] = []
  for (const [index, block] of projection.stableBlocks.entries()) {
    const key = messageBodyRenderCacheKeyCreate(request.messageId, block)
    const cachedHtml = blockCache.get(key)
    stableHtml[index] = cachedHtml
    if (cachedHtml === undefined) stableMisses.push({ index, key, raw: block.raw })
  }

  const stableRenderPromises = stableMisses.map(async (miss) => ({ ...miss, html: await renderHtml(miss.raw) }))
  const liveRenderPromise =
    projection.liveBlock === undefined
      ? Promise.resolve<string | undefined>(undefined)
      : (async () => renderHtml(projection.liveBlock?.raw ?? ""))()
  const [stableResults, liveHtml] = await Promise.all([Promise.all(stableRenderPromises), liveRenderPromise])

  const cacheEntries: MessageBodyRenderCacheEntry[] = []
  for (const result of stableResults) {
    stableHtml[result.index] = result.html
    cacheEntries.push({ key: result.key, html: result.html })
  }

  return { html: `${stableHtml.map((html) => html ?? "").join("")}${liveHtml ?? ""}`, cacheEntries }
}

function messageBodyRenderCacheKeyCreate(
  ownerIdentity: string,
  block: { id: string; type: string; raw: string },
): MessageBodyRenderCacheKey {
  return {
    ownerIdentity,
    blockIdentity: block.id,
    blockType: block.type,
    rawContent: block.raw,
    rendererVersion: messageBodyRenderRendererVersion,
  }
}
