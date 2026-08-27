import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type SkillPresetInspectionResponse,
  skillPresetInspectionResponseSchema,
} from "../api/skillPresetInspectionResponseSchema.js"

type SkillPresetInspectionFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Typed read of the checked-in `.agents/skill-presets/*.yaml` catalog and its diagnostics. */
export function skillPresetInspectionFetch(
  projectId: string,
  dependencies: SkillPresetInspectionFetchDependencies = {},
): Promise<Result<SkillPresetInspectionResponse>> {
  const op = "skillPresetInspectionFetch"
  if (projectId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/project/skills/presets",
    query: { project: projectId },
    responseSchema: skillPresetInspectionResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
