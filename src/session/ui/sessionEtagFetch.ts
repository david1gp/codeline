import { createResult, type Result } from "@adaptive-ds/result"
import { sessionDetailFetch } from "./sessionDetailFetch.js"

/**
 * Loads the current session ETag for a conditional write. The rename, pin, and
 * delete routes all require `If-Match`, and the sidebar has no cached
 * representation of its own, so it reads the shell before mutating.
 */
export async function sessionEtagFetch(
  sessionId: string,
  dependencies: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } = {},
): Promise<Result<string>> {
  const detail = await sessionDetailFetch(sessionId, dependencies)
  if (!detail.success) return detail
  return createResult(detail.data.etag)
}
