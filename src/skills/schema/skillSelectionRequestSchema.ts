import * as v from "valibot"
import { skillPresetSchema } from "./skillPresetSchema.js"
import { skillSelectionOverrideSchema } from "./skillSelectionOverrideSchema.js"

export const skillSelectionRequestSchema = v.strictObject({
  override: v.optional(skillSelectionOverrideSchema),
  presetName: v.optional(skillPresetSchema.entries.name),
})

export type SkillSelectionRequest = v.InferOutput<typeof skillSelectionRequestSchema>
