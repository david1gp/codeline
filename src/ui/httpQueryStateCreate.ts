import type { Result } from "@adaptive-ds/result"
import { createEffect, onCleanup } from "solid-js"
import type { ApiEtag } from "../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../api/schema/apiRevisionSchema.js"
import { httpQueryCacheCreate } from "./httpQueryCacheCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type HttpQueryStatus = "complete" | "error" | "unknown"

type HttpQueryLoadResponse<T> = { data: T; etag: ApiEtag; revision: ApiRevision; status: 200 } | { status: 304 }

type HttpQueryCache = ReturnType<typeof httpQueryCacheCreate>

type HttpQueryStateOptions<T> = {
  cache?: HttpQueryCache
  enabled?: () => boolean
  /** Re-runs whenever the returned key changes. Return undefined to stay idle. */
  key: () => string | undefined
  load: (
    key: string,
    signal: AbortSignal,
    cached: ReturnType<HttpQueryCache["get"]> | undefined,
  ) => Promise<Result<T | HttpQueryLoadResponse<T>>>
}

function httpQueryLoadResponseResolve<T>(value: T | HttpQueryLoadResponse<T>): HttpQueryLoadResponse<T> | undefined {
  if (typeof value !== "object" || value === null || !("status" in value)) return undefined
  if (value.status === 304) return { status: 304 }
  if (value.status !== 200 || !("data" in value) || !("etag" in value) || !("revision" in value)) return undefined
  return value as HttpQueryLoadResponse<T>
}

/**
 * Loading/error/retry/refresh envelope around a one-shot typed HTTP read, so UI
 * state creators keep the same status contract they had with reactive queries.
 * Data is retained across a refresh of the same key so callers can distinguish
 * a first load from a background revalidation, and cleared when the key changes
 * so a new selection never renders the previous subject's rows.
 */
export function httpQueryStateCreate<T>(options: HttpQueryStateOptions<T>) {
  const data = signalObjectCreate<T | undefined>(undefined)
  const status = signalObjectCreate<HttpQueryStatus>("unknown")
  const errorMessage = signalObjectCreate<string | undefined>(undefined)
  const version = signalObjectCreate(0)
  let controller: AbortController | undefined
  let loadedKey: string | undefined

  createEffect(() => {
    version.get()
    const key = options.key()
    const enabled = (options.enabled?.() ?? true) && key !== undefined
    controller?.abort()
    controller = undefined

    if (key !== loadedKey) {
      const cached = key === undefined ? undefined : options.cache?.get<T>(key)
      data.set(() => cached?.data)
      loadedKey = key
    }

    if (!enabled) {
      status.set("unknown")
      errorMessage.set(undefined)
      data.set(undefined)
      return
    }

    const active = new AbortController()
    controller = active
    status.set("unknown")
    errorMessage.set(undefined)

    const cached = options.cache?.get<T>(key)
    if (cached !== undefined) data.set(() => cached.data)
    void options.load(key, active.signal, cached).then((result) => {
      if (active.signal.aborted) return
      if (!result.success) {
        status.set("error")
        errorMessage.set(result.errorMessage)
        return
      }

      const response = httpQueryLoadResponseResolve(result.data)
      if (response?.status === 304) {
        if (cached === undefined) {
          status.set("error")
          errorMessage.set("The conditional response has no cached representation.")
          return
        }
        data.set(() => cached.data)
        errorMessage.set(undefined)
        status.set("complete")
        return
      }

      if (response?.status === 200) {
        const replaced = options.cache?.replace(key, response)
        if (replaced === false) {
          const current = options.cache?.get<T>(key)
          if (current !== undefined) data.set(() => current.data)
          errorMessage.set(undefined)
          status.set("complete")
          return
        }
        data.set(() => response.data)
      } else {
        data.set(() => result.data as T)
      }
      errorMessage.set(undefined)
      status.set("complete")
    })
  })

  onCleanup(() => controller?.abort())

  const reload = () => version.set(version.get() + 1)
  const invalidate = (revision: ApiRevision) => {
    const key = options.key()
    if (key === undefined) return false
    const changed = options.cache?.invalidate(key, revision) ?? true
    if (changed) reload()
    return changed
  }

  return {
    data: data.get,
    errorMessage: errorMessage.get,
    invalidate,
    isComplete: () => status.get() === "complete",
    isError: () => status.get() === "error",
    isLoading: () => status.get() === "unknown",
    refresh: reload,
    retry: reload,
    status: status.get,
  }
}
