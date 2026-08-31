import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runToolDetailSchema } from "./runToolDetailSchema.js"

export const runToolDetailResponseSchema = v.strictObject({
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
  tool: runToolDetailSchema,
})

export type RunToolDetailResponse = v.InferOutput<typeof runToolDetailResponseSchema>
