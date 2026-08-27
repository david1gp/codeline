import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { skillPresetCatalogSchema } from "../schema/skillPresetCatalogSchema.js"
import type { SkillPreset } from "../schema/skillPresetSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"

const skillPresetDefault: SkillPreset = {
  description: "No project skills are enabled by default.",
  excludeSkills: [],
  includeFolders: [],
  includeSkills: [],
  name: "default",
  version: 1,
}

export function skillPresetResolve(input: { catalog: unknown; presetName?: unknown }): Result<SkillPreset> {
  const op = "skillPresetResolve"
  const catalog = v.safeParse(skillPresetCatalogSchema, input.catalog)
  if (!catalog.success) return createResultError(op, "The skill preset catalog is invalid.")
  const presetName = input.presetName === undefined ? "default" : input.presetName
  const parsedName = v.safeParse(skillPresetSchema.entries.name, presetName)
  if (!parsedName.success) return createResultError(op, "The skill preset name is invalid.")
  const preset = catalog.output.presets.find(({ name }) => name === parsedName.output)
  if (preset !== undefined) return createResult(structuredClone(preset))
  if (parsedName.output === skillPresetDefault.name) return createResult(structuredClone(skillPresetDefault))
  return createResultError(op, "The requested skill preset could not be found.")
}
