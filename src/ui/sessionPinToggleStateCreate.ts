import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"

type SessionPinToggleStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: () => string
  pinned: () => boolean
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
      const response = await fetcher(`/api/sessions/${encodeURIComponent(options.sessionId())}/pin`, {
        body: JSON.stringify({ pinned: next }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      })
      if (response.ok) {
        optimisticPinned.set(undefined)
        return
      }
      const body: unknown = await response.json().catch(() => undefined)
      const error = v.safeParse(apiErrorResponseSchema, body)
      optimisticPinned.set(previous)
      errorMessage.set(error.success ? error.output.error.message : "The pinned state could not be updated.")
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
