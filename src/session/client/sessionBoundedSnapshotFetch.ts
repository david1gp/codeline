import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type SessionBoundedSnapshot, sessionBoundedSnapshotSchema } from "../api/sessionBoundedSnapshotSchema.js"

export function sessionBoundedSnapshotFetch(
  sessionId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<SessionBoundedSnapshot>> {
  const op = "sessionBoundedSnapshotFetch"
  if (sessionId.trim().length === 0)
    return Promise.resolve(createResultError(op, "The session identifier is required."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/bounded-snapshot`,
    responseSchema: sessionBoundedSnapshotSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
