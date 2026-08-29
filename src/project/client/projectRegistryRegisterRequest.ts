import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiProjectResponse,
  projectRegistryApiProjectResponseSchema,
} from "../api/projectRegistryApiProjectResponseSchema.js"
import {
  type ProjectRegistryRegisterRequest,
  projectRegistryRegisterRequestSchema,
} from "../api/projectRegistryRegisterRequestSchema.js"

type ProjectRegistryRegisterRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryRegisterRequest(
  input: ProjectRegistryRegisterRequest,
  dependencies: ProjectRegistryRegisterRequestDependencies = {},
): Promise<Result<ProjectRegistryApiProjectResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    body: input,
    op: "projectRegistryRegisterRequest",
    path: "/api/project/registry",
    requestSchema: projectRegistryRegisterRequestSchema,
    responseSchema: projectRegistryApiProjectResponseSchema,
  })
}
