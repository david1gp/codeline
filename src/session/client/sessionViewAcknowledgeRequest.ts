import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type SessionViewAcknowledgementResponse,
  sessionViewAcknowledgementResponseSchema,
} from "../api/sessionViewAcknowledgementResponseSchema.js"

export function sessionViewAcknowledgeRequest(
  sessionId: string,
  dependencies: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } = {},
): Promise<Result<SessionViewAcknowledgementResponse>> {
  const op = "sessionViewAcknowledgeRequest"
  if (sessionId.trim().length === 0)
    return Promise.resolve(createResultError(op, "The session identifier is required."))
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/view`,
    responseSchema: sessionViewAcknowledgementResponseSchema,
  })
}
