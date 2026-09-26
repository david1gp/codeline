import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunDetailResponse, runDetailResponseSchema } from "../api/runDetailResponseSchema.js"

export function runDetailFetch(
  sessionId: string,
  runId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<RunDetailResponse>> {
  const op = "runDetailFetch"
  if (sessionId.trim().length === 0 || runId.trim().length === 0)
    return Promise.resolve(createResultError(op, "The session and run identifiers are required."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/detail`,
    responseSchema: runDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
