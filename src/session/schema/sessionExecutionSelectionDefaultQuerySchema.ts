import * as v from "valibot"
import { sessionExecutionSelectionDefaultSchema } from "./sessionExecutionSelectionDefaultSchema.js"

export const sessionExecutionSelectionDefaultQuerySchema = v.strictObject({
  projectPath: v.optional(sessionExecutionSelectionDefaultSchema.entries.projectPath),
})

export type SessionExecutionSelectionDefaultQuery = v.InferOutput<typeof sessionExecutionSelectionDefaultQuerySchema>
