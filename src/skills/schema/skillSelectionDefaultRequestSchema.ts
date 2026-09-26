import * as v from "valibot"
import { skillSelectionDefaultSchema } from "./skillSelectionDefaultSchema.js"
import { skillSelectionRequestSchema } from "./skillSelectionRequestSchema.js"

export const skillSelectionDefaultRequestSchema = v.strictObject({
  override: v.optional(skillSelectionRequestSchema.entries.override, { disabledSkills: [], enabledSkills: [] }),
  presetName: skillSelectionDefaultSchema.entries.presetName,
  projectPath: v.optional(skillSelectionDefaultSchema.entries.projectPath),
})

export type SkillSelectionDefaultRequest = v.InferOutput<typeof skillSelectionDefaultRequestSchema>
