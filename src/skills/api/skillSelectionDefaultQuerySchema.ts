import * as v from "valibot"
import { skillSelectionDefaultSchema } from "../schema/skillSelectionDefaultSchema.js"

export const skillSelectionDefaultQuerySchema = v.strictObject({
  projectPath: v.optional(skillSelectionDefaultSchema.entries.projectPath),
})

export type SkillSelectionDefaultQuery = v.InferOutput<typeof skillSelectionDefaultQuerySchema>
