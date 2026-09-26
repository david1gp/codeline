import * as v from "valibot"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { sessionExecutionSelectionDefaultSchema } from "../schema/sessionExecutionSelectionDefaultSchema.js"

const sessionExecutionSelectionDefaultTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const sessionExecutionSelectionDefaultResponseSchema = v.strictObject({
  createdAt: sessionExecutionSelectionDefaultTimestampSchema,
  executionSelection: sessionExecutionSelectionDefaultSchema.entries.executionSelection,
  projectPath: sessionExecutionSelectionDefaultSchema.entries.projectPath,
  revision: apiRevisionSchema,
  updatedAt: sessionExecutionSelectionDefaultTimestampSchema,
})

export type SessionExecutionSelectionDefaultResponse = v.InferOutput<
  typeof sessionExecutionSelectionDefaultResponseSchema
>
