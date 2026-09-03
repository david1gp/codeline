import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunDetailResponse, runDetailResponseSchema } from "../api/runDetailResponseSchema.js"

export function runChildConversationDetailFetch(
  parentSessionId: string,
  childRunId: string,
  delegationId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<RunDetailResponse>> {
  const op = "runChildConversationDetailFetch"
  if (parentSessionId.trim().length === 0 || childRunId.trim().length === 0 || delegationId.trim().length === 0)
    return Promise.resolve(
      createResultError(op, "The parent session, child run, and delegation identifiers are required."),
    )

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(parentSessionId)}/delegations/${encodeURIComponent(delegationId)}/runs/${encodeURIComponent(childRunId)}/detail`,
    responseSchema: runDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
