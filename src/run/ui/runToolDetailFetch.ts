import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunToolDetailResponse, runToolDetailResponseSchema } from "../api/runToolDetailResponseSchema.js"

export function runToolDetailFetch(
  sessionId: string,
  runId: string,
  detailId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<RunToolDetailResponse>> {
  const op = "runToolDetailFetch"
  if (sessionId.trim().length === 0 || runId.trim().length === 0 || detailId.trim().length === 0)
    return Promise.resolve(createResultError(op, "The session, run, and tool identifiers are required."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/tools/${encodeURIComponent(detailId)}/detail`,
    responseSchema: runToolDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
