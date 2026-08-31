import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { runToolDetailSchema } from "./runToolDetailSchema.js"
import { runTranscriptSchema } from "./runTranscriptSchema.js"

export const runDetailResponseSchema = v.strictObject({
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

export type RunDetailResponse = v.InferOutput<typeof runDetailResponseSchema>
