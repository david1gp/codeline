import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryOpenCodeImportResponse,
  projectRegistryOpenCodeImportResponseSchema,
} from "../api/projectRegistryOpenCodeImportResponseSchema.js"

type ProjectRegistryOpenCodeImportRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export function projectRegistryOpenCodeImportRequest(
  dependencies: ProjectRegistryOpenCodeImportRequestDependencies = {},
): Promise<Result<ProjectRegistryOpenCodeImportResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    op: "projectRegistryOpenCodeImportRequest",
    path: "/api/project/registry/import",
    responseSchema: projectRegistryOpenCodeImportResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
