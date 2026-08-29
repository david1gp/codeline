import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"

export const noteUpdateRequestSchema = v.strictObject({
  content: v.string(),
  id: v.optional(apiPublicIdSchema),
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  projectId: v.nullable(projectIdSchema),
  updatedAt: v.number(),
})

export type NoteUpdateRequest = v.InferOutput<typeof noteUpdateRequestSchema>
