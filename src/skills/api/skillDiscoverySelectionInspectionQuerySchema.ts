import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../../project/projectDiscoveryIdSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"

export const skillDiscoverySelectionInspectionQuerySchema = v.strictObject({
  preset: v.optional(skillPresetSchema.entries.name),
  project: projectDiscoveryIdSchema,
})

export type SkillDiscoverySelectionInspectionQuery = v.InferOutput<typeof skillDiscoverySelectionInspectionQuerySchema>
