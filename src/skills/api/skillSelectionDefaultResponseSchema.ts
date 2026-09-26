import * as v from "valibot"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { skillSelectionDefaultSchema } from "../schema/skillSelectionDefaultSchema.js"

const skillSelectionDefaultTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const skillSelectionDefaultResponseSchema = v.strictObject({
  createdAt: skillSelectionDefaultTimestampSchema,
  override: skillSelectionDefaultSchema.entries.override,
  presetName: skillSelectionDefaultSchema.entries.presetName,
  projectPath: skillSelectionDefaultSchema.entries.projectPath,
  revision: apiRevisionSchema,
  updatedAt: skillSelectionDefaultTimestampSchema,
})

export type SkillSelectionDefaultResponse = v.InferOutput<typeof skillSelectionDefaultResponseSchema>
