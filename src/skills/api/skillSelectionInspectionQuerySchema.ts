import * as v from "valibot"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"

export const skillSelectionInspectionQuerySchema = v.strictObject({
  preset: v.optional(skillPresetSchema.entries.name),
  project: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
})

export type SkillSelectionInspectionQuery = v.InferOutput<typeof skillSelectionInspectionQuerySchema>
