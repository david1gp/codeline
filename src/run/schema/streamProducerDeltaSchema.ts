import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

const streamProducerDeltaKindSchema = v.picklist(["text", "thinking", "tool"])

export const streamProducerDeltaSchema = v.strictObject({
  delta: v.string(),
  deltaKind: streamProducerDeltaKindSchema,
  messageId: v.nullable(apiPublicIdSchema),
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
})

export type StreamProducerDelta = v.InferOutput<typeof streamProducerDeltaSchema>
