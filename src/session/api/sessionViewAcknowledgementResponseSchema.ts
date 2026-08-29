import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

const sessionViewAcknowledgementTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const sessionViewAcknowledgementResponseSchema = v.strictObject({
  acknowledgedFinishedAt: v.nullable(sessionViewAcknowledgementTimestampSchema),
  sessionId: apiPublicIdSchema,
})

export type SessionViewAcknowledgementResponse = v.InferOutput<typeof sessionViewAcknowledgementResponseSchema>
