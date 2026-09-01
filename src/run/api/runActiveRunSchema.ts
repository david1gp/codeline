import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

export const runActiveRunSchema = v.strictObject({
  id: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
  status: runStatusSchema,
})

export type RunActiveRun = v.InferOutput<typeof runActiveRunSchema>
