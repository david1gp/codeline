import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

const messageTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const messageApiRecordSchema = v.strictObject({
  agentId: apiPublicIdSchema,
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  content: v.string(),
  createdAt: messageTimestampSchema,
  finalizedAt: messageTimestampSchema,
  id: apiPublicIdSchema,
  metadata: v.unknown(),
  role: v.picklist(["assistant", "user"]),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(1)),
  sessionId: apiPublicIdSchema,
})

export type MessageApiRecord = v.InferOutput<typeof messageApiRecordSchema>
