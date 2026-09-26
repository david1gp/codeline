import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type SkillCatalogInspectionResponse,
  skillCatalogInspectionResponseSchema,
} from "../api/skillCatalogInspectionResponseSchema.js"

type SkillCatalogInspectionFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Typed read of the discovered skill roots, groups, bundles, collisions, and diagnostics. */
export function skillCatalogInspectionFetch(
  projectId: string,
  dependencies: SkillCatalogInspectionFetchDependencies = {},
): Promise<Result<SkillCatalogInspectionResponse>> {
  const op = "skillCatalogInspectionFetch"
  if (projectId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/project/skills/catalog",
    query: { project: projectId },
    responseSchema: skillCatalogInspectionResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
