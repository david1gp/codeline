import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useLocation } from "@solidjs/router"
import { onCleanup, onMount } from "solid-js"
import * as v from "valibot"
import type { AuthProvidersResponse } from "../api/authProvidersResponseSchema.js"
import { authProvidersResponseSchema } from "../api/authProvidersResponseSchema.js"
import { authReturnPathResolve } from "./authReturnPathResolve.js"

type LoginPageStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/** Public login view state. It must not touch protected data requests. */
export function loginPageStateCreate(options: LoginPageStateOptions = {}) {
  const fetcher = options.fetcher ?? fetch
  const location = useLocation<{ returnTo?: string }>()
  const returnTo = () => authReturnPathResolve(location.query.returnTo as string | undefined)
  const providers = createSignalObject<AuthProvidersResponse["providers"]>([])
  const status = createSignalObject<"error" | "loading" | "ready">("loading")
  let controller: AbortController | undefined

  const load = async () => {
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    status.set("loading")

    try {
      const response = await fetcher("/api/auth/providers", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-store" },
        signal: requestController.signal,
      })
      if (!response.ok) throw new Error("The authentication provider request failed.")
      const parsed = v.safeParse(authProvidersResponseSchema, await response.json())
      if (!parsed.success) throw new Error("The authentication provider response is invalid.")
      if (requestController.signal.aborted) return
      providers.set(parsed.output.providers)
      status.set("ready")
    } catch (_error: unknown) {
      if (requestController.signal.aborted) return
      providers.set([])
      status.set("error")
    }
  }

  onMount(() => void load())
  onCleanup(() => controller?.abort())

  return {
    loginHref: (providerId: string) =>
      `/api/auth/login?provider=${encodeURIComponent(providerId)}&returnTo=${encodeURIComponent(returnTo())}`,
    providers: providers.get,
    returnTo,
    status: status.get,
  }
}
