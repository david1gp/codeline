import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"

type SessionWatchToggleStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: () => string
  watched: () => boolean
}

export function sessionWatchToggleStateCreate(options: SessionWatchToggleStateOptions) {
  const fetcher = options.fetcher ?? fetch
  const optimisticWatched = createSignalObject<boolean | undefined>(undefined)
  const isSaving = createSignalObject(false)
  const errorMessage = createSignalObject<string | undefined>(undefined)
  const watched = () => optimisticWatched.get() ?? options.watched()

  const toggle = async () => {
    if (isSaving.get()) return
    const previous = watched()
    const next = !previous
    optimisticWatched.set(next)
    errorMessage.set(undefined)
    isSaving.set(true)

    try {
      const response = await fetcher(`/api/sessions/${encodeURIComponent(options.sessionId())}/watch`, {
        body: JSON.stringify({ watched: next }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      })
      if (response.ok) {
        optimisticWatched.set(undefined)
        return
      }
      const body: unknown = await response.json().catch(() => undefined)
      const error = v.safeParse(apiErrorResponseSchema, body)
      optimisticWatched.set(previous)
      errorMessage.set(error.success ? error.output.error.message : "The watched state could not be updated.")
    } catch (_error: unknown) {
      optimisticWatched.set(previous)
      errorMessage.set("The watched state could not be updated. Check your connection and try again.")
    } finally {
      isSaving.set(false)
    }
  }

  return {
    errorMessage: errorMessage.get,
    isSaving: isSaving.get,
    toggle: () => void toggle(),
    watched,
  }
}
