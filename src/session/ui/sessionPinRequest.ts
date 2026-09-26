import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type SessionDetailResponse, sessionDetailResponseSchema } from "../api/sessionDetailResponseSchema.js"
import { sessionPinRequestSchema } from "../schema/sessionPinRequestSchema.js"

/**
 * Typed `PATCH /api/sessions/:sessionId/pin`. The route requires `If-Match`, so
 * the caller supplies the ETag of the representation it is toggling.
 */
export async function sessionPinRequest(
  sessionId: string,
  pinned: boolean,
  dependencies: { etag: string; fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> },
): Promise<Result<SessionDetailResponse>> {
  const op = "sessionPinRequest"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")
  if (dependencies.etag.trim().length === 0) return createResultError(op, "The session is still loading. Try again.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: { pinned },
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/pin`,
    requestSchema: sessionPinRequestSchema,
    responseSchema: sessionDetailResponseSchema,
  })
}
