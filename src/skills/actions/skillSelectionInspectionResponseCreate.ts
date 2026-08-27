import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type SkillSelectionInspectionResponse,
  skillSelectionInspectionResponseSchema,
} from "../api/skillSelectionInspectionResponseSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"
import { skillSelectionSchema } from "../schema/skillSelectionSchema.js"
import { skillDescriptionCatalogRender } from "./skillDescriptionCatalogRender.js"
import { skillInspectionSnapshotCreate } from "./skillInspectionSnapshotCreate.js"

export function skillSelectionInspectionResponseCreate(input: {
  catalogDigest: string
  preset: unknown
  presetCatalogDigest: string
  projectId: string
  selection: unknown
}): Result<SkillSelectionInspectionResponse> {
  const op = "skillSelectionInspectionResponseCreate"
  const preset = v.safeParse(skillPresetSchema, input.preset)
  const selection = v.safeParse(skillSelectionSchema, input.selection)
  if (!preset.success || !selection.success)
    return createResultError(op, "The skill selection inspection input is invalid.")
  const activeSkills = selection.output.activeSkills.map((snapshot) => skillInspectionSnapshotCreate(snapshot))
  if (activeSkills.some((result) => !result.success))
    return createResultError(op, "The skill selection inspection snapshots are invalid.")
  const descriptionCatalog = skillDescriptionCatalogRender(selection.output)
  if (!descriptionCatalog.success) return descriptionCatalog
  const response = v.safeParse(skillSelectionInspectionResponseSchema, {
    catalogDigest: input.catalogDigest,
    descriptionCatalog: descriptionCatalog.data,
    preset: preset.output,
    presetCatalogDigest: input.presetCatalogDigest,
    projectId: input.projectId,
    selection: {
      activeSkills: activeSkills.map((result) => (result.success ? result.data : undefined)),
      excludedSkillNames: selection.output.excludedSkillNames,
      missingFolderPaths: selection.output.missingFolderPaths,
      missingSkillNames: selection.output.missingSkillNames,
      presetName: selection.output.presetName,
      userOverride: selection.output.userOverride,
      version: 1 as const,
    },
    version: 1 as const,
  })
  if (!response.success) return createResultError(op, "The skill selection inspection response is invalid.")
  return createResult(response.output)
}
