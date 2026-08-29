import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiFolderResponse,
  projectRegistryApiFolderResponseSchema,
} from "../api/projectRegistryApiFolderResponseSchema.js"
import {
  type ProjectRegistryFolderRequest,
  projectRegistryFolderRequestSchema,
} from "../api/projectRegistryFolderRequestSchema.js"

type ProjectRegistryFolderCreateRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryFolderCreateRequest(
  input: ProjectRegistryFolderRequest,
  dependencies: ProjectRegistryFolderCreateRequestDependencies = {},
): Promise<Result<ProjectRegistryApiFolderResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    body: input,
    op: "projectRegistryFolderCreateRequest",
    path: "/api/project/registry/folders",
    requestSchema: projectRegistryFolderRequestSchema,
    responseSchema: projectRegistryApiFolderResponseSchema,
  })
}
