import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type CommandCatalogInspectionResponse,
  commandCatalogInspectionResponseSchema,
} from "../api/commandCatalogInspectionResponseSchema.js"

type CommandCatalogInspectionFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Typed read of the discovered command roots, commands, collisions, and diagnostics. */
export function commandCatalogInspectionFetch(
  projectId: string,
  dependencies: CommandCatalogInspectionFetchDependencies = {},
): Promise<Result<CommandCatalogInspectionResponse>> {
  const op = "commandCatalogInspectionFetch"
  if (projectId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/project/commands/catalog",
    query: { project: projectId },
    responseSchema: commandCatalogInspectionResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
