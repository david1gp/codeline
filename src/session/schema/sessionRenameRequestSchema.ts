import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"

export const sessionRenameRequestSchema = v.strictObject({
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
})

export type SessionRenameRequest = v.InferOutput<typeof sessionRenameRequestSchema>
