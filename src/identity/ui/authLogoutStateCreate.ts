import { createSignal } from "solid-js/dist/solid.js"

type AuthLogoutStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  navigateToLogin: () => void
  sessionClear: () => void
}

/**
 * Ends the browser session. The server revokes the opaque cookie first, then
 * protected state is cleared and navigation is replaced with /login so history
 * cannot return to a protected surface.
 */
export function authLogoutStateCreate(options: AuthLogoutStateOptions) {
  const fetcher = options.fetcher ?? fetch
  const [busy, busySet] = createSignal(false)

  const logout = async () => {
    if (busy()) return
    busySet(true)
    try {
      await fetcher("/api/auth/logout", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-store" },
        method: "POST",
      }).catch(() => undefined)

      options.sessionClear()
      options.navigateToLogin()
    } finally {
      busySet(false)
    }
  }

  return {
    busy,
    logout: () => void logout(),
  }
}
