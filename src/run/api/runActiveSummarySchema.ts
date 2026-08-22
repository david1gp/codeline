import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

export const runActiveSummarySchema = v.strictObject({
  lastSequence: apiSequenceSchema,
  partialText: v.string(),
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
  // Reconciliation may observe a terminal transition, so terminal statuses are intentional here.
  status: runStatusSchema,
})

export type RunActiveSummary = v.InferOutput<typeof runActiveSummarySchema>
