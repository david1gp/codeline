import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiListResponse,
  projectRegistryApiListResponseSchema,
} from "../api/projectRegistryApiListResponseSchema.js"

type ProjectRegistryListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export function projectRegistryListFetch(
  dependencies: ProjectRegistryListFetchDependencies = {},
): Promise<Result<ProjectRegistryApiListResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op: "projectRegistryListFetch",
    path: "/api/project/registry",
    responseSchema: projectRegistryApiListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
