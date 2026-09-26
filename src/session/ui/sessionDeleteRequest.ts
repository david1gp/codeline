import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type SessionDeleteResponse, sessionDeleteResponseSchema } from "../api/sessionDeleteResponseSchema.js"

/**
 * Typed `DELETE /api/sessions/:sessionId`. The route requires `If-Match`, so
 * the caller supplies the ETag of the representation it is deleting.
 */
export async function sessionDeleteRequest(
  sessionId: string,
  dependencies: { etag: string; fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> },
): Promise<Result<SessionDeleteResponse>> {
  const op = "sessionDeleteRequest"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")
  if (dependencies.etag.trim().length === 0) return createResultError(op, "The session is still loading. Try again.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.delete({
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}`,
    responseSchema: sessionDeleteResponseSchema,
  })
}
