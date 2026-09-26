import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import * as v from "valibot"

export type GlobalResourceKind = "skills" | "commands"

const entry = v.object({ name: v.string(), content: v.string() })
const createBody = v.object({ name: v.string(), content: v.string() })
const updateBody = v.object({ content: v.string() })

export function globalResourceClientCreate(
  kind: GlobalResourceKind,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
) {
  const client = apiHttpClientCreate({ fetch: fetcher })
  const base = `/api/global/${kind}`
  const path = (name: string) => `${base}/${encodeURIComponent(name).replace(/%2F/gi, "/")}`
  return {
    list: (signal?: AbortSignal) =>
      client.get({
        cache: "no-store",
        op: "globalResourceList",
        path: base,
        responseSchema: v.object({ [kind]: v.array(v.string()) }),
        signal,
      }),
    get: (name: string, signal?: AbortSignal) =>
      client.get({ cache: "no-store", op: "globalResourceGet", path: path(name), responseSchema: entry, signal }),
    create: (name: string, content: string) =>
      client.post({
        op: "globalResourceCreate",
        path: base,
        body: { name, content },
        requestSchema: createBody,
        responseSchema: entry,
      }),
    update: (name: string, content: string) =>
      client.request({
        method: "PUT",
        op: "globalResourceUpdate",
        path: path(name),
        body: { content },
        requestSchema: updateBody,
        responseSchema: entry,
      }),
    delete: (name: string) =>
      client.delete({ op: "globalResourceDelete", path: path(name), responseSchema: v.undefined() }),
  }
}
