import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiProjectResponse,
  projectRegistryApiProjectResponseSchema,
} from "../api/projectRegistryApiProjectResponseSchema.js"
import {
  type ProjectRegistryMoveRequest,
  projectRegistryMoveRequestSchema,
} from "../api/projectRegistryMoveRequestSchema.js"
import { projectIdSchema } from "../projectIdSchema.js"

type ProjectRegistryMoveRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryMoveRequest(
  projectId: string,
  input: ProjectRegistryMoveRequest,
  dependencies: ProjectRegistryMoveRequestDependencies = {},
): Promise<Result<ProjectRegistryApiProjectResponse>> {
  const op = "projectRegistryMoveRequest"
  if (!v.safeParse(projectIdSchema, projectId).success)
    return Promise.resolve(createResultError(op, "The project identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: input,
    op,
    path: `/api/project/registry/move/${encodeURIComponent(projectId)}`,
    requestSchema: projectRegistryMoveRequestSchema,
    responseSchema: projectRegistryApiProjectResponseSchema,
  })
}
