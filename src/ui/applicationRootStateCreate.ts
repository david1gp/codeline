import { useLocation } from "@solidjs/router"
import { authReturnPathResolve } from "../identity/ui/authReturnPathResolve.js"
import { authSessionStateCreate } from "../identity/ui/authSessionStateCreate.js"
import { signedOutCachedBrowsingResolve } from "./signedOutCachedBrowsingResolve.js"

type ApplicationRootStateOptions = {
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Decides which root shell renders. Signed-out visitors normally see the sign-in
 * prompt, but a session route whose account matches the last locally active user
 * may be browsed read-only from the device-local settled cache.
 */
export function applicationRootStateCreate(options: ApplicationRootStateOptions) {
  const session = authSessionStateCreate({ fetcher: options.fetcher })
  const location = useLocation()
  const returnTo = () => authReturnPathResolve(`${location.pathname}${location.search}${location.hash}`)

  return {
    displayName: session.displayName,
    isSignedOutCachedBrowsing: () =>
      session.status() === "signed-out" &&
      signedOutCachedBrowsingResolve({ pathname: location.pathname, search: location.search }),
    loginHref: () => `/login?returnTo=${encodeURIComponent(returnTo())}`,
    retry: session.retry,
    signOut: session.signOut,
    status: session.status,
    userId: session.userId,
  }
}
