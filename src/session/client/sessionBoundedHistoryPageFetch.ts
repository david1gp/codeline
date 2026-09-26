import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type SessionBoundedHistoryPage,
  sessionBoundedHistoryPageSchema,
} from "../api/sessionBoundedHistoryPageSchema.js"

export function sessionBoundedHistoryPageFetch(
  sessionId: string,
  cursor: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<SessionBoundedHistoryPage>> {
  const op = "sessionBoundedHistoryPageFetch"
  if (sessionId.trim().length === 0)
    return Promise.resolve(createResultError(op, "The session identifier is required."))
  if (cursor.trim().length === 0) return Promise.resolve(createResultError(op, "The history cursor is required."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/bounded-history`,
    query: { cursor, limit: 25 },
    responseSchema: sessionBoundedHistoryPageSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
