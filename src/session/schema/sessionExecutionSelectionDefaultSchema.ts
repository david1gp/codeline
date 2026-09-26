import * as v from "valibot"
import { sessionExecutionSelectionSchema } from "./sessionExecutionSelectionSchema.js"

const sessionExecutionSelectionDefaultProjectPathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
)

export const sessionExecutionSelectionDefaultSchema = v.strictObject({
  executionSelection: sessionExecutionSelectionSchema,
  projectPath: sessionExecutionSelectionDefaultProjectPathSchema,
})

export type SessionExecutionSelectionDefault = v.InferOutput<typeof sessionExecutionSelectionDefaultSchema>
