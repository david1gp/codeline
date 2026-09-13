import * as v from "valibot"
import { projectIdSchema } from "../../project/schema/projectIdSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"

export const skillSelectionInspectionQuerySchema = v.strictObject({
  preset: v.optional(skillPresetSchema.entries.name),
  project: projectIdSchema,
})

export type SkillSelectionInspectionQuery = v.InferOutput<typeof skillSelectionInspectionQuerySchema>
