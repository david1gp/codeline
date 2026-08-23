import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type RunSessionStreamSnapshotResponse,
  runSessionStreamSnapshotResponseSchema,
} from "../api/runSessionStreamSnapshotResponseSchema.js"

type SessionStreamSnapshotFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function sessionStreamSnapshotFetch(
  sessionId: string,
  dependencies: SessionStreamSnapshotFetchDependencies = {},
): Promise<Result<RunSessionStreamSnapshotResponse>> {
  const op = "sessionStreamSnapshotFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/stream-snapshot`,
    responseSchema: runSessionStreamSnapshotResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
