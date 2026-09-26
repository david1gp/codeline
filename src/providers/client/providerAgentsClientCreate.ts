import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { providerApiAgentsResponseSchema } from "../api/providerApiAgentsResponseSchema.js"

export function providerAgentsClientCreate(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
) {
  const client = apiHttpClientCreate({ fetch: fetcher })
  return {
    list: () => client.get({ cache: "no-store", op: "providerAgentsList", path: "/api/providers/agents", responseSchema: providerApiAgentsResponseSchema }),
  }
}
