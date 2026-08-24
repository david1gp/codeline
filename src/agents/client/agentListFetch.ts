import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type AgentListResponse, agentListResponseSchema } from "../api/agentListResponseSchema.js"

type AgentListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  search?: string
  signal?: AbortSignal
}

export function agentListFetch(
  serverId: string,
  dependencies: AgentListFetchDependencies = {},
): Promise<Result<AgentListResponse>> {
  const op = "agentListFetch"
  if (serverId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The server identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: `/api/servers/${encodeURIComponent(serverId)}/agents`,
    query: dependencies.search === undefined ? undefined : { search: dependencies.search },
    responseSchema: agentListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
