import type { Result } from "@adaptive-ds/result"
import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { sessionEtagFetch } from "../session/ui/sessionEtagFetch.js"
import { sessionPinRequest } from "../session/ui/sessionPinRequest.js"

type SessionPinToggleStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: () => string
  pinned: () => boolean
  mutate?: (sessionId: string, pinned: boolean) => Promise<Result<unknown>>
}

export function sessionPinToggleStateCreate(options: SessionPinToggleStateOptions) {
  const fetcher = options.fetcher ?? fetch
  const optimisticPinned = createSignalObject<boolean | undefined>(undefined)
  const isSaving = createSignalObject(false)
  const errorMessage = createSignalObject<string | undefined>(undefined)
  const pinned = () => optimisticPinned.get() ?? options.pinned()

  const toggle = async () => {
    if (isSaving.get()) return
    const previous = pinned()
    const next = !previous
    optimisticPinned.set(next)
    errorMessage.set(undefined)
    isSaving.set(true)

    try {
      if (options.mutate !== undefined) {
        const result = await options.mutate(options.sessionId(), next)
        if (result.success) {
          optimisticPinned.set(undefined)
          return
        }
        optimisticPinned.set(previous)
        errorMessage.set(result.errorMessage)
        return
      }
      const sessionId = options.sessionId()
      const etag = await sessionEtagFetch(sessionId, { fetch: fetcher })
      if (!etag.success) {
        optimisticPinned.set(previous)
        errorMessage.set("The pinned state could not be updated.")
        return
      }
      const updated = await sessionPinRequest(sessionId, next, { etag: etag.data, fetch: fetcher })
      if (updated.success) {
        optimisticPinned.set(undefined)
        return
      }
      optimisticPinned.set(previous)
      errorMessage.set(
        updated.code === "network_error"
          ? "The pinned state could not be updated. Check your connection and try again."
          : updated.errorMessage,
      )
    } catch (_error: unknown) {
      optimisticPinned.set(previous)
      errorMessage.set("The pinned state could not be updated. Check your connection and try again.")
    } finally {
      isSaving.set(false)
    }
  }

  return {
    errorMessage: errorMessage.get,
    isSaving: isSaving.get,
    toggle: () => void toggle(),
    pinned,
  }
}
