import * as v from "valibot"
import { skillSelectionPreferenceSchema } from "./skillSelectionPreferenceSchema.js"

const skillSelectionDefaultProjectPathSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4_096))

export const skillSelectionDefaultSchema = v.strictObject({
  ...skillSelectionPreferenceSchema.entries,
  projectPath: skillSelectionDefaultProjectPathSchema,
})

export type SkillSelectionDefault = v.InferOutput<typeof skillSelectionDefaultSchema>
