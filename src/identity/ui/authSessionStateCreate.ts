import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { authSessionResponseSchema } from "../api/authSessionResponseSchema.js"

export type AuthSessionStatus = "error" | "loading" | "signed-in" | "signed-out"

type AuthSessionStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Bootstraps the protected UI. Protected data surfaces stay unmounted
 * until the server confirms the durable user ID, so a 401 can never expose a
 * previously cached user's synchronized data.
 */
export function authSessionStateCreate(options: AuthSessionStateOptions = {}) {
  const fetcher = options.fetcher ?? fetch
  const [status, statusSet] = createSignal<AuthSessionStatus>("loading")
  const [displayName, displayNameSet] = createSignal<string | undefined>(undefined)
  const [organizationId, organizationIdSet] = createSignal<string | undefined>(undefined)
  const [token, tokenSet] = createSignal<string | undefined>(undefined)
  const [userId, userIdSet] = createSignal<string | undefined>(undefined)
  let controller: AbortController | undefined
  let requestVersion = 0

  const load = async () => {
    const version = requestVersion + 1
    requestVersion = version
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    displayNameSet(undefined)
    organizationIdSet(undefined)
    tokenSet(undefined)
    userIdSet(undefined)
    statusSet("loading")

    try {
      const response = await fetcher("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-store" },
        signal: requestController.signal,
      })
      if (requestController.signal.aborted || version !== requestVersion) return

      if (response.status === 401 || response.status === 403) {
        displayNameSet(undefined)
        organizationIdSet(undefined)
        tokenSet(undefined)
        userIdSet(undefined)
        statusSet("signed-out")
        return
      }
      if (!response.ok) throw new Error("The session request failed.")

      const parsed = v.safeParse(authSessionResponseSchema, await response.json())
      if (requestController.signal.aborted || version !== requestVersion) return
      if (!parsed.success || parsed.output.displayName === "" || parsed.output.userId === "")
        throw new Error("The session response is invalid.")

      displayNameSet(parsed.output.displayName)
      organizationIdSet(parsed.output.organizationId)
      tokenSet(parsed.output.token)
      userIdSet(parsed.output.userId)
      statusSet("signed-in")
    } catch (_error: unknown) {
      if (requestController.signal.aborted || version !== requestVersion) return
      displayNameSet(undefined)
      organizationIdSet(undefined)
      tokenSet(undefined)
      userIdSet(undefined)
      statusSet("error")
    }
  }

  void load()
  onCleanup(() => controller?.abort())

  return {
    displayName,
    organizationId,
    retry: () => void load(),
    signOut: () => {
      requestVersion += 1
      controller?.abort()
      displayNameSet(undefined)
      organizationIdSet(undefined)
      tokenSet(undefined)
      userIdSet(undefined)
      statusSet("signed-out")
    },
    status,
    token,
    userId,
  }
}
