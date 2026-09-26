import { apiQueryKeyCreate } from "../api/client/apiQueryKeyCreate.js"
import type { ApiEtag } from "../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../api/schema/apiRevisionSchema.js"

type HttpQueryCacheEntry<T> = {
  data: T
  etag: ApiEtag
  revision: ApiRevision
}

type HttpQueryCacheRecord = HttpQueryCacheEntry<unknown>

type HttpQueryCache = {
  clear: (key?: string) => void
  get: <T>(key: string) => HttpQueryCacheEntry<T> | undefined
  invalidate: (key: string, revision: ApiRevision) => boolean
  replace: <T>(key: string, entry: HttpQueryCacheEntry<T>) => boolean
}

const accountCaches = new Map<string, HttpQueryCache>()

function httpQueryCacheKeyResolve(key: string): string {
  if (!key.startsWith("/")) return key
  try {
    return apiQueryKeyCreate(key)
  } catch (_error) {
    return key
  }
}

/** Shared volatile HTTP representation metadata and data for one account. Keys are canonical query/resource keys. */
export function httpQueryCacheCreate(accountId: string): HttpQueryCache {
  const existing = accountCaches.get(accountId)
  if (existing !== undefined) return existing

  const entries = new Map<string, HttpQueryCacheRecord>()
  const invalidations = new Map<string, ApiRevision>()
  const cache: HttpQueryCache = {
    clear: (key) => {
      if (key === undefined) {
        entries.clear()
        invalidations.clear()
        return
      }
      const canonicalKey = httpQueryCacheKeyResolve(key)
      entries.delete(canonicalKey)
      invalidations.delete(canonicalKey)
    },
    get: <T>(key: string) => entries.get(httpQueryCacheKeyResolve(key)) as HttpQueryCacheEntry<T> | undefined,
    invalidate: (key, revision) => {
      const canonicalKey = httpQueryCacheKeyResolve(key)
      const current = entries.get(canonicalKey)?.revision ?? -1
      const pending = invalidations.get(canonicalKey) ?? -1
      if (revision <= Math.max(current, pending)) return false
      invalidations.set(canonicalKey, revision)
      return true
    },
    replace: (key, entry) => {
      const canonicalKey = httpQueryCacheKeyResolve(key)
      const current = entries.get(canonicalKey)
      const pending = invalidations.get(canonicalKey)
      if (current !== undefined && entry.revision < current.revision) return false
      if (pending !== undefined && entry.revision < pending) return false
      entries.set(canonicalKey, entry)
      if (pending !== undefined && entry.revision >= pending) invalidations.delete(canonicalKey)
      return true
    },
  }
  accountCaches.set(accountId, cache)
  return cache
}
