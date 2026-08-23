import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunDelegationsResponse, runDelegationsResponseSchema } from "../api/runDelegationsResponseSchema.js"

type SessionDelegationsFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function sessionDelegationsFetch(
  sessionId: string,
  dependencies: SessionDelegationsFetchDependencies = {},
): Promise<Result<RunDelegationsResponse>> {
  const op = "sessionDelegationsFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/delegations`,
    responseSchema: runDelegationsResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
