import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiProjectResponse,
  projectRegistryApiProjectResponseSchema,
} from "../api/projectRegistryApiProjectResponseSchema.js"
import { projectIdSchema } from "../projectIdSchema.js"

type ProjectRegistryResolveFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryResolveFetch(
  projectId: string,
  dependencies: ProjectRegistryResolveFetchDependencies = {},
): Promise<Result<ProjectRegistryApiProjectResponse>> {
  const op = "projectRegistryResolveFetch"
  if (!v.safeParse(projectIdSchema, projectId).success)
    return Promise.resolve(createResultError(op, "The project identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: `/api/project/registry/${encodeURIComponent(projectId)}`,
    responseSchema: projectRegistryApiProjectResponseSchema,
  })
}
