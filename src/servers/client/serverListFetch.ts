import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type ServerListResponse, serverListResponseSchema } from "../api/serverListResponseSchema.js"

type ServerListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  search?: string
  signal?: AbortSignal
}

export function serverListFetch(dependencies: ServerListFetchDependencies = {}): Promise<Result<ServerListResponse>> {
  const op = "serverListFetch"
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/servers",
    query: dependencies.search === undefined ? undefined : { search: dependencies.search },
    responseSchema: serverListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
