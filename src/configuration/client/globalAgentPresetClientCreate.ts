import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { globalAgentPresetDocumentSchema, type GlobalAgentPresetDocument } from "../globalAgentPresetDocumentSchema.js"

export function globalAgentPresetClientCreate(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
) {
  const client = apiHttpClientCreate({ fetch: fetcher })
  const path = "/api/global/agent-presets"
  return {
    get: () =>
      client.get({
        cache: "no-store",
        op: "globalAgentPresetGet",
        path,
        responseSchema: globalAgentPresetDocumentSchema,
      }),
    put: (document: GlobalAgentPresetDocument) =>
      client.request({
        method: "PUT",
        op: "globalAgentPresetPut",
        path,
        body: document,
        requestSchema: globalAgentPresetDocumentSchema,
        responseSchema: globalAgentPresetDocumentSchema,
      }),
  }
}
