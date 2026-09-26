import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { projectApiAgentsResponseSchema } from "../api/projectApiAgentsResponseSchema.js"

export function projectAgentsClientCreate(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch) {
  const client = apiHttpClientCreate({ fetch: fetcher })
  return {
    list: (projectId: string, signal?: AbortSignal) => client.get({
      cache: "no-store", op: "projectAgentsList",
      path: `/api/project/agents?project=${encodeURIComponent(projectId)}`,
      responseSchema: projectApiAgentsResponseSchema, signal,
    }),
  }
}
