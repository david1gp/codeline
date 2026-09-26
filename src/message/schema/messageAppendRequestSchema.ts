import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"

export const messageAppendRequestSchema = v.strictObject({
  clientRequestId: apiIdempotencyKeySchema,
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(100_000)),
  role: v.picklist(["assistant", "user"]),
})

export type MessageAppendRequest = v.InferOutput<typeof messageAppendRequestSchema>
