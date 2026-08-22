import type { Result } from "@adaptive-ds/result"
import type { FunctionReference } from "convex/server"
import { createEffect, createSignal, onCleanup, useContext } from "solid-js"
import { convexContext } from "./convexContext.js"

type ConvexQueryStatus = "complete" | "error" | "unknown"

export function codelineConvexQueryCreate<T>(
  query: FunctionReference<"query">,
  args: () => Record<string, unknown>,
  options: { enabled?: () => boolean; keepData?: boolean } = {},
) {
  const context = useContext(convexContext)
  const [data, dataSet] = createSignal<T | undefined>(undefined)
  const [status, statusSet] = createSignal<ConvexQueryStatus>("unknown")
  const [errorMessage, errorMessageSet] = createSignal<string | undefined>(undefined)
  const [retryVersion, retryVersionSet] = createSignal(0)
  let unsubscribe: (() => void) | undefined

  createEffect(() => {
    retryVersion()
    const enabled = options.enabled?.() ?? true
    unsubscribe?.()
    unsubscribe = undefined
    if (!enabled || context === undefined) {
      statusSet("unknown")
      if (options.keepData !== true) dataSet(undefined)
      return
    }

    statusSet("unknown")
    errorMessageSet(undefined)
    if (options.keepData !== true) dataSet(undefined)
    unsubscribe = context.client.onUpdate(
      query,
      { ...args(), token: context.token },
      (value: unknown) => {
        if (!convexResultIs<T>(value)) {
          statusSet("error")
          errorMessageSet("The Convex response is invalid.")
          return
        }
        if (!value.success) {
          statusSet("error")
          errorMessageSet(value.errorMessage)
          return
        }
        dataSet(() => value.data as T)
        statusSet("complete")
      },
      (error: Error) => {
        statusSet("error")
        errorMessageSet(error.message)
      },
    )
  })

  onCleanup(() => unsubscribe?.())

  return {
    data,
    errorMessage,
    isComplete: () => status() === "complete",
    isError: () => status() === "error",
    isLoading: () => status() === "unknown",
    retry: () => retryVersionSet((version) => version + 1),
    status,
  }
}

function convexResultIs<T>(value: unknown): value is Result<T> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}
