import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunActiveListResponse, runActiveListResponseSchema } from "../api/runActiveListResponseSchema.js"

type RunActiveListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function runActiveListFetch(
  sessionId: string,
  dependencies: RunActiveListFetchDependencies = {},
): Promise<Result<RunActiveListResponse>> {
  const op = "runActiveListFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/active-runs`,
    responseSchema: runActiveListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
