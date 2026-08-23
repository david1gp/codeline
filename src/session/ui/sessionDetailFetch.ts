import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type SessionDetailResponse, sessionDetailResponseSchema } from "../api/sessionDetailResponseSchema.js"

/**
 * Typed `GET /api/sessions/:sessionId` read for the selected session shell.
 * The response carries the session revision and ETag used by conditional writes.
 */
export async function sessionDetailFetch(
  sessionId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<SessionDetailResponse>> {
  const op = "sessionDetailFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}`,
    responseSchema: sessionDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
