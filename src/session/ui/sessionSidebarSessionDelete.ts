import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { sessionDeleteRequest } from "../ui/sessionDeleteRequest.js"
import { sessionEtagFetch } from "../ui/sessionEtagFetch.js"

export async function sessionSidebarSessionDelete(
  sessionId: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Result<true>> {
  const op = "sessionSidebarSessionDelete"
  const etag = await sessionEtagFetch(sessionId, { fetch: fetcher })
  if (!etag.success) return createResultError(op, "The session could not be deleted.")

  const deleted = await sessionDeleteRequest(sessionId, { etag: etag.data, fetch: fetcher })
  if (deleted.success) return createResult(true)
  if (deleted.code === "network_error")
    return createResultError(op, "The session could not be deleted. Check your connection and try again.")
  return createResultError(op, deleted.errorMessage)
}
