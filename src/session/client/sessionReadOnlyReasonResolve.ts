import type { SessionCacheStatus } from "./sessionCacheStatus.js"

export type SessionReadOnlyReason = "offline" | "signed-out" | "stale"

type SessionReadOnlyReasonInput = {
  /** A validated bounded cache snapshot is available for rendering. */
  hasCachedSnapshot: boolean
  /** The authoritative live session representation has loaded over HTTP. */
  hasLiveSession: boolean
  isOnline: boolean
  isSignedIn: boolean
  cacheStatus: SessionCacheStatus
}

/**
 * Decides whether the session is rendered from device-local cache rather than
 * from an authoritative online read. Every such state is read-only: there is no
 * offline mutation queue, and a signed-out reader may only browse.
 */
export function sessionReadOnlyReasonResolve(input: SessionReadOnlyReasonInput): SessionReadOnlyReason | null {
  if (!input.isSignedIn) return input.hasCachedSnapshot ? "signed-out" : null
  if (!input.isOnline) return "offline"
  if (input.hasLiveSession) return null
  if (input.hasCachedSnapshot && (input.cacheStatus === "error" || input.cacheStatus === "revalidating")) return "stale"
  return null
}
