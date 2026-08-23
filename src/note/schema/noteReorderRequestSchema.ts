import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const noteReorderRequestSchema = v.strictObject({
  direction: v.picklist(["up", "down"]),
  id: v.optional(apiPublicIdSchema),
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  projectPath: v.nullable(v.string()),
})

export type NoteReorderRequest = v.InferOutput<typeof noteReorderRequestSchema>
