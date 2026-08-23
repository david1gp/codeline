import { sessionLastActiveAccountRead } from "../session/client/sessionLastActiveAccountRead.js"
import { sessionRouteResolve } from "./sessionRouteResolve.js"

/**
 * Signed-out browsing is limited to read-only session routes belonging to the
 * last locally active account. Every other surface still requires sign-in, so a
 * signed-out visitor cannot reach mutating or account-agnostic screens.
 */
export function signedOutCachedBrowsingResolve(
  url: Pick<URL, "pathname" | "search">,
  lastActiveUserId: string | null = sessionLastActiveAccountRead(),
): boolean {
  if (lastActiveUserId === null) return false
  return sessionRouteResolve(url).sessionId !== null
}
