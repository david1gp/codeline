import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiFolderListResponse,
  projectRegistryApiFolderListResponseSchema,
} from "../api/projectRegistryApiFolderListResponseSchema.js"

type ProjectRegistryFolderListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export function projectRegistryFolderListFetch(
  dependencies: ProjectRegistryFolderListFetchDependencies = {},
): Promise<Result<ProjectRegistryApiFolderListResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op: "projectRegistryFolderListFetch",
    path: "/api/project/registry/folders",
    responseSchema: projectRegistryApiFolderListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
