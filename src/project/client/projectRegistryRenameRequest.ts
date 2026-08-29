import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { projectIdSchema } from "../projectIdSchema.js"
import {
  type ProjectRegistryApiProjectResponse,
  projectRegistryApiProjectResponseSchema,
} from "../api/projectRegistryApiProjectResponseSchema.js"
import {
  type ProjectRegistryRenameRequest,
  projectRegistryRenameRequestSchema,
} from "../api/projectRegistryRenameRequestSchema.js"

type ProjectRegistryRenameRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryRenameRequest(
  projectId: string,
  input: ProjectRegistryRenameRequest,
  dependencies: ProjectRegistryRenameRequestDependencies = {},
): Promise<Result<ProjectRegistryApiProjectResponse>> {
  const op = "projectRegistryRenameRequest"
  if (!v.safeParse(projectIdSchema, projectId).success)
    return Promise.resolve(createResultError(op, "The project identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: input,
    op,
    path: `/api/project/registry/${encodeURIComponent(projectId)}`,
    requestSchema: projectRegistryRenameRequestSchema,
    responseSchema: projectRegistryApiProjectResponseSchema,
  })
}
