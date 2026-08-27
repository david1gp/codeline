import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type SkillPresetInspectionResponse,
  skillPresetInspectionResponseSchema,
} from "../api/skillPresetInspectionResponseSchema.js"
import { skillPresetCatalogSchema } from "../schema/skillPresetCatalogSchema.js"

function skillPresetInspectionPathResolve(projectRoot: string, candidatePath: string): string {
  const resolved = path.resolve(candidatePath)
  const relativePath = path.relative(projectRoot, resolved)
  if (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
    return relativePath.split(path.sep).join("/") || "."
  return ".agents/skill-presets"
}

export function skillPresetInspectionResponseCreate(input: {
  catalog: unknown
  projectId: string
  projectRoot: string
}): Result<SkillPresetInspectionResponse> {
  const op = "skillPresetInspectionResponseCreate"
  const catalog = v.safeParse(skillPresetCatalogSchema, input.catalog)
  if (!catalog.success || !path.isAbsolute(input.projectRoot))
    return createResultError(op, "The skill preset inspection input is invalid.")
  const response = v.safeParse(skillPresetInspectionResponseSchema, {
    diagnostics: catalog.output.diagnostics.map(({ code, message, path: diagnosticPath, relativePath }) => ({
      code,
      message,
      path: skillPresetInspectionPathResolve(input.projectRoot, diagnosticPath),
      relativePath: skillPresetInspectionPathResolve(input.projectRoot, relativePath),
      validation: "invalid" as const,
    })),
    digest: catalog.output.digest,
    presets: catalog.output.presets,
    projectId: input.projectId,
    version: 1 as const,
  })
  if (!response.success) return createResultError(op, "The skill preset inspection response is invalid.")
  return createResult(response.output)
}
