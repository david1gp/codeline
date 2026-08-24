import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type RunActiveSnapshotResponse,
  runActiveSnapshotResponseSchema,
} from "../api/runActiveSnapshotResponseSchema.js"

type RunActiveSnapshotFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function runActiveSnapshotFetch(
  sessionId: string,
  runId: string,
  dependencies: RunActiveSnapshotFetchDependencies = {},
): Promise<Result<RunActiveSnapshotResponse>> {
  const op = "runActiveSnapshotFetch"
  if (sessionId.trim().length === 0 || runId.trim().length === 0)
    return createResultError(op, "The session and run identifiers are required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/snapshot`,
    responseSchema: runActiveSnapshotResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
