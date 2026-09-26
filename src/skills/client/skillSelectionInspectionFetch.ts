import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type SkillSelectionInspectionResponse,
  skillSelectionInspectionResponseSchema,
} from "../api/skillSelectionInspectionResponseSchema.js"

type SkillSelectionInspectionFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /** Optional pre-session preset override; omitted to use the persisted user default. */
  presetName?: string
  signal?: AbortSignal
}

/**
 * Typed read of the server-resolved pre-session skill selection, including the
 * effective active skills and the estimated description-catalog context.
 */
export function skillSelectionInspectionFetch(
  projectId: string,
  dependencies: SkillSelectionInspectionFetchDependencies = {},
): Promise<Result<SkillSelectionInspectionResponse>> {
  const op = "skillSelectionInspectionFetch"
  if (projectId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/project/skills/selection",
    query: {
      project: projectId,
      ...(dependencies.presetName === undefined ? {} : { preset: dependencies.presetName }),
    },
    responseSchema: skillSelectionInspectionResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
