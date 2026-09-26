import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { skillPresetCatalogSchema } from "../schema/skillPresetCatalogSchema.js"
import { skillSelectionOverrideSchema } from "../schema/skillSelectionOverrideSchema.js"
import { skillSelectionPreferenceSchema } from "../schema/skillSelectionPreferenceSchema.js"
import { skillSelectionRequestSchema } from "../schema/skillSelectionRequestSchema.js"
import type { SkillSelection } from "../schema/skillSelectionSchema.js"
import { skillPresetResolve } from "./skillPresetResolve.js"
import { skillSelectionResolve } from "./skillSelectionResolve.js"

export function skillSelectionPreSessionResolve(input: {
  catalog: unknown
  defaultPreference?: unknown
  presetCatalog: unknown
  request?: unknown
}): Result<SkillSelection> {
  const op = "skillSelectionPreSessionResolve"
  const request = v.safeParse(skillSelectionRequestSchema, input.request ?? {})
  if (!request.success) return createResultError(op, "The pre-session skill selection is invalid.")

  let defaultPreference: v.InferOutput<typeof skillSelectionPreferenceSchema> | undefined
  if (input.defaultPreference !== undefined) {
    const parsedDefault = v.safeParse(skillSelectionPreferenceSchema, input.defaultPreference)
    if (!parsedDefault.success) return createResultError(op, "The persisted skill selection default is invalid.")
    defaultPreference = parsedDefault.output
  }

  const presetCatalog = v.safeParse(skillPresetCatalogSchema, input.presetCatalog)
  if (!presetCatalog.success) return createResultError(op, "The skill preset catalog is invalid.")

  const preset = skillPresetResolve({
    catalog: presetCatalog.output,
    presetName: request.output.presetName ?? defaultPreference?.presetName,
  })
  if (!preset.success) return preset

  const override = request.output.override ?? defaultPreference?.override ?? { disabledSkills: [], enabledSkills: [] }
  const parsedOverride = v.safeParse(skillSelectionOverrideSchema, override)
  if (!parsedOverride.success) return createResultError(op, "The pre-session skill override is invalid.")
  return skillSelectionResolve({ catalog: input.catalog, override: parsedOverride.output, preset: preset.data })
}
