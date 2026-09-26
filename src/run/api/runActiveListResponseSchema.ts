import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

/**
 * Reload discovery for a session. A reloaded tab knows its session but not the
 * run identifier of the detached execution, so it reads this list first and then
 * reads the run-specific active snapshot for each returned run.
 */
export const runActiveListResponseSchema = v.strictObject({
  runs: v.array(
    v.strictObject({
      runId: apiPublicIdSchema,
      status: runStatusSchema,
    }),
  ),
})

export type RunActiveListResponse = v.InferOutput<typeof runActiveListResponseSchema>
