import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { projectRegistryRemoveResponseSchema } from "../api/projectRegistryRemoveResponseSchema.js"
import { projectIdSchema } from "../projectIdSchema.js"

type ProjectRegistryRemoveRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryRemoveRequest(
  projectId: string,
  dependencies: ProjectRegistryRemoveRequestDependencies = {},
): Promise<Result<undefined>> {
  const op = "projectRegistryRemoveRequest"
  if (!v.safeParse(projectIdSchema, projectId).success)
    return Promise.resolve(createResultError(op, "The project identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.delete({
    op,
    path: `/api/project/registry/${encodeURIComponent(projectId)}`,
    responseSchema: projectRegistryRemoveResponseSchema,
  })
}
