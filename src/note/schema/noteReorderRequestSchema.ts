import * as v from "valibot"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"

export const noteReorderRequestSchema = v.strictObject({
  direction: v.picklist(["up", "down"]),
  id: v.optional(apiPublicIdSchema),
  idempotencyKey: v.optional(apiIdempotencyKeySchema),
  projectId: v.nullable(projectIdSchema),
})

export type NoteReorderRequest = v.InferOutput<typeof noteReorderRequestSchema>
