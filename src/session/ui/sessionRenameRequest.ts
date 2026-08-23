import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type SessionDetailResponse, sessionDetailResponseSchema } from "../api/sessionDetailResponseSchema.js"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"

/**
 * Typed `PATCH /api/sessions/:sessionId` rename. The route requires `If-Match`,
 * so the caller supplies the ETag of the representation it is editing.
 */
export async function sessionRenameRequest(
  sessionId: string,
  title: string,
  dependencies: { etag: string; fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> },
): Promise<Result<SessionDetailResponse>> {
  const op = "sessionRenameRequest"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")
  if (dependencies.etag.trim().length === 0) return createResultError(op, "The session is still loading. Try again.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: { title },
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}`,
    requestSchema: sessionRenameRequestSchema,
    responseSchema: sessionDetailResponseSchema,
  })
}
