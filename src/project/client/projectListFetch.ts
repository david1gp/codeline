import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type ProjectApiListResponse, projectApiListResponseSchema } from "../api/projectApiListResponseSchema.js"

type ProjectListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Typed read of discovered project selections. Paths are never exposed by this contract. */
export function projectListFetch(
  dependencies: ProjectListFetchDependencies = {},
): Promise<Result<ProjectApiListResponse>> {
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op: "projectListFetch",
    path: "/api/project/list",
    responseSchema: projectApiListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
