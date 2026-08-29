import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { projectRegistryRemoveResponseSchema } from "../api/projectRegistryRemoveResponseSchema.js"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"

type ProjectRegistryFolderRemoveRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryFolderRemoveRequest(
  folderId: string,
  dependencies: ProjectRegistryFolderRemoveRequestDependencies = {},
): Promise<Result<undefined>> {
  const op = "projectRegistryFolderRemoveRequest"
  if (!v.safeParse(projectFolderIdSchema, folderId).success)
    return Promise.resolve(createResultError(op, "The project folder identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.delete({
    op,
    path: `/api/project/registry/folders/${encodeURIComponent(folderId)}`,
    responseSchema: projectRegistryRemoveResponseSchema,
  })
}
