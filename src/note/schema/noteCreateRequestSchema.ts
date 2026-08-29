import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"

export const noteCreateRequestSchema = v.strictObject({
  content: v.string(),
  createdAt: v.number(),
  id: apiPublicIdSchema,
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  projectId: v.nullable(projectIdSchema),
  updatedAt: v.number(),
})

export type NoteCreateRequest = v.InferOutput<typeof noteCreateRequestSchema>
