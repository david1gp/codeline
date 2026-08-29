import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type ProjectRegistryApiFolderResponse,
  projectRegistryApiFolderResponseSchema,
} from "../api/projectRegistryApiFolderResponseSchema.js"
import {
  type ProjectRegistryFolderRequest,
  projectRegistryFolderRequestSchema,
} from "../api/projectRegistryFolderRequestSchema.js"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"

type ProjectRegistryFolderRenameRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function projectRegistryFolderRenameRequest(
  folderId: string,
  input: ProjectRegistryFolderRequest,
  dependencies: ProjectRegistryFolderRenameRequestDependencies = {},
): Promise<Result<ProjectRegistryApiFolderResponse>> {
  const op = "projectRegistryFolderRenameRequest"
  if (!v.safeParse(projectFolderIdSchema, folderId).success)
    return Promise.resolve(createResultError(op, "The project folder identifier is invalid."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: input,
    op,
    path: `/api/project/registry/folders/${encodeURIComponent(folderId)}`,
    requestSchema: projectRegistryFolderRequestSchema,
    responseSchema: projectRegistryApiFolderResponseSchema,
  })
}
