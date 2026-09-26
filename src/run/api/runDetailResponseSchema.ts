import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { runActiveDetailSchema } from "./runActiveDetailSchema.js"
import { runActiveRunSchema } from "./runActiveRunSchema.js"
import { runToolDetailSchema } from "./runToolDetailSchema.js"
import { runTranscriptSchema } from "./runTranscriptSchema.js"

const runFinalizedDetailResponseSchema = v.strictObject({
  run: v.strictObject({
    cancellationKind: v.nullable(runCancellationKindSchema),
    failure: v.nullable(runFailureMetadataSchema),
    id: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
    status: runStatusSchema,
  }),
  tools: v.pipe(v.array(runToolDetailSchema), v.maxLength(1_000)),
  transcript: runTranscriptSchema,
})

const runFinalizedDetailEnvelopeSchema = v.strictObject({
  detail: runFinalizedDetailResponseSchema,
  kind: v.literal("finalized"),
})

const runActiveDetailEnvelopeSchema = v.strictObject({
  detail: v.nullable(runActiveDetailSchema),
  kind: v.literal("active"),
  run: runActiveRunSchema,
})

export const runDetailResponseSchema = v.variant("kind", [
  runFinalizedDetailEnvelopeSchema,
  runActiveDetailEnvelopeSchema,
])

export type RunDetailResponse = v.InferOutput<typeof runDetailResponseSchema>
