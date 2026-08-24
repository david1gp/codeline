import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type AgentDetailResponse, agentDetailResponseSchema } from "../api/agentDetailResponseSchema.js"

type AgentDetailFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function agentDetailFetch(
  serverId: string,
  agentId: string,
  dependencies: AgentDetailFetchDependencies = {},
): Promise<Result<AgentDetailResponse | undefined>> {
  const op = "agentDetailFetch"
  if (serverId.trim().length === 0) return createResultError(op, "The server identifier is required.")
  if (agentId.trim().length === 0) return createResultError(op, "The agent identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  const result = await client.get({
    cache: "no-store",
    op,
    path: `/api/servers/${encodeURIComponent(serverId)}/agents/${encodeURIComponent(agentId)}`,
    responseSchema: agentDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
  if (!result.success && result.statusCode === 404) return createResult(undefined)
  return result
}
