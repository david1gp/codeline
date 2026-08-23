import type { Result } from "@adaptive-ds/result"
import { createEffect, onCleanup } from "solid-js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type HttpQueryStatus = "complete" | "error" | "unknown"

type HttpQueryStateOptions<T> = {
  enabled?: () => boolean
  /** Re-runs whenever the returned key changes. Return undefined to stay idle. */
  key: () => string | undefined
  load: (key: string, signal: AbortSignal) => Promise<Result<T>>
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
      data.set(undefined)
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

    void options.load(key, active.signal).then((result) => {
      if (active.signal.aborted) return
      if (!result.success) {
        status.set("error")
        errorMessage.set(result.errorMessage)
        return
      }
      data.set(() => result.data)
      errorMessage.set(undefined)
      status.set("complete")
    })
  })

  onCleanup(() => controller?.abort())

  const reload = () => version.set(version.get() + 1)

  return {
    data: data.get,
    errorMessage: errorMessage.get,
    isComplete: () => status.get() === "complete",
    isError: () => status.get() === "error",
    isLoading: () => status.get() === "unknown",
    refresh: reload,
    retry: reload,
    status: status.get,
  }
}
