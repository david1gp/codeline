import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type RunSessionSnapshotResponse,
  runSessionSnapshotResponseSchema,
} from "../api/runSessionSnapshotResponseSchema.js"

type RunSessionSnapshotFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function runSessionSnapshotFetch(
  sessionId: string,
  dependencies: RunSessionSnapshotFetchDependencies = {},
): Promise<Result<RunSessionSnapshotResponse>> {
  const op = "runSessionSnapshotFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/snapshot`,
    responseSchema: runSessionSnapshotResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
