import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runActiveDetailSchema } from "./runActiveDetailSchema.js"
import { runActiveRunSchema } from "./runActiveRunSchema.js"
import { runToolDetailSchema } from "./runToolDetailSchema.js"

const runFinalizedToolDetailResponseSchema = v.strictObject({
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
  tool: runToolDetailSchema,
})

const runFinalizedToolDetailEnvelopeSchema = v.strictObject({
  detail: runFinalizedToolDetailResponseSchema,
  kind: v.literal("finalized"),
})

const runActiveToolDetailEnvelopeSchema = v.strictObject({
  detail: v.nullable(runActiveDetailSchema),
  detailId: apiPublicIdSchema,
  kind: v.literal("active"),
  run: runActiveRunSchema,
})

export const runToolDetailResponseSchema = v.variant("kind", [
  runFinalizedToolDetailEnvelopeSchema,
  runActiveToolDetailEnvelopeSchema,
])

export type RunToolDetailResponse = v.InferOutput<typeof runToolDetailResponseSchema>
