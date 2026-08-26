import * as v from "valibot"
import { sessionExecutionSelectionDefaultSchema } from "./sessionExecutionSelectionDefaultSchema.js"

export const sessionExecutionSelectionDefaultRequestSchema = v.strictObject({
  executionSelection: sessionExecutionSelectionDefaultSchema.entries.executionSelection,
  projectPath: v.optional(sessionExecutionSelectionDefaultSchema.entries.projectPath),
})

export type SessionExecutionSelectionDefaultRequest = v.InferOutput<
  typeof sessionExecutionSelectionDefaultRequestSchema
>
