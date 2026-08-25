type MarkdownBlockCacheOptions = {
  maxEntries: number
}

type MarkdownBlockCacheKey = {
  ownerIdentity: string
  blockIdentity: string
  blockType: string
  rawContent: string
  rendererVersion: string
}

type MarkdownBlockCacheEntry = {
  html: string
  rawContent: string
}

/** Keeps the most recently used rendered blocks for one cache owner. */
export function markdownBlockCacheCreate(options: MarkdownBlockCacheOptions) {
  const maxEntries = Number.isFinite(options.maxEntries) ? Math.max(0, Math.floor(options.maxEntries)) : 0
  const entries = new Map<string, MarkdownBlockCacheEntry>()
  let disposed = false

  const clear = (): void => {
    entries.clear()
  }

  const dispose = (): void => {
    clear()
    disposed = true
  }

  const get = (key: MarkdownBlockCacheKey): string | undefined => {
    if (disposed) return undefined
    const cacheKey = markdownBlockCacheKeyCreate(key)
    const entry = entries.get(cacheKey)
    if (entry === undefined) return undefined
    if (entry.rawContent !== key.rawContent) return undefined
    entries.delete(cacheKey)
    entries.set(cacheKey, entry)
    return entry.html
  }

  const set = (key: MarkdownBlockCacheKey, html: string): void => {
    if (disposed || maxEntries === 0) return
    const cacheKey = markdownBlockCacheKeyCreate(key)
    entries.delete(cacheKey)
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value
      if (oldestKey === undefined) break
      entries.delete(oldestKey)
    }
    entries.set(cacheKey, { html, rawContent: key.rawContent })
  }

  return { clear, dispose, get, set }
}

function markdownBlockCacheKeyCreate(key: MarkdownBlockCacheKey): string {
  return JSON.stringify([
    key.ownerIdentity,
    key.blockIdentity,
    key.blockType,
    markdownBlockCacheRawContentHashCreate(key.rawContent),
    key.rendererVersion,
  ])
}

function markdownBlockCacheRawContentHashCreate(rawContent: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < rawContent.length; index += 1) {
    hash ^= BigInt(rawContent.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}
