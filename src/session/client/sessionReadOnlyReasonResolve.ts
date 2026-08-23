import type { SessionSettledCacheStatus } from "./sessionSettledCacheStatus.js"

export type SessionReadOnlyReason = "offline" | "signed-out" | "stale"

type SessionReadOnlyReasonInput = {
  /** A validated cached settled record is available for rendering. */
  hasCachedRecord: boolean
  /** The authoritative live session representation has loaded over HTTP. */
  hasLiveSession: boolean
  isOnline: boolean
  isSignedIn: boolean
  cacheStatus: SessionSettledCacheStatus
}

/**
 * Decides whether the session is rendered from device-local cache rather than
 * from an authoritative online read. Every such state is read-only: there is no
 * offline mutation queue, and a signed-out reader may only browse.
 */
export function sessionReadOnlyReasonResolve(input: SessionReadOnlyReasonInput): SessionReadOnlyReason | null {
  if (!input.isSignedIn) return input.hasCachedRecord ? "signed-out" : null
  if (!input.isOnline) return "offline"
  if (input.hasLiveSession) return null
  if (input.hasCachedRecord && (input.cacheStatus === "error" || input.cacheStatus === "revalidating")) return "stale"
  return null
}
