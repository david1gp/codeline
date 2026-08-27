import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectApiIdentityResponse,
  projectApiIdentityResponseSchema,
} from "../api/projectApiIdentityResponseSchema.js"

type ProjectIdentityFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/**
 * Typed resolution of a project reference to its stable discovered id. The browser
 * never derives an id from a display label, because labels are disambiguated.
 */
export function projectIdentityFetch(
  projectPath: string,
  dependencies: ProjectIdentityFetchDependencies = {},
): Promise<Result<ProjectApiIdentityResponse>> {
  const op = "projectIdentityFetch"
  if (projectPath.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project reference is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/project/identity",
    query: { path: projectPath },
    responseSchema: projectApiIdentityResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
