import * as v from "valibot"
import { skillPresetSchema } from "./skillPresetSchema.js"
import { skillSelectionOverrideSchema } from "./skillSelectionOverrideSchema.js"

export const skillSelectionPreferenceSchema = v.strictObject({
  override: skillSelectionOverrideSchema,
  presetName: skillPresetSchema.entries.name,
})

export type SkillSelectionPreference = v.InferOutput<typeof skillSelectionPreferenceSchema>
