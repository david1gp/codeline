import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"

export const sessionPinRequestSchema = v.strictObject({
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  pinned: v.boolean(),
})

export type SessionPinRequest = v.InferOutput<typeof sessionPinRequestSchema>
