import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const noteUpdateRequestSchema = v.strictObject({
  content: v.string(),
  id: v.optional(apiPublicIdSchema),
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  projectPath: v.nullable(v.string()),
  updatedAt: v.number(),
})

export type NoteUpdateRequest = v.InferOutput<typeof noteUpdateRequestSchema>
