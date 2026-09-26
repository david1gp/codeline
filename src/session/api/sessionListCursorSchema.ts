import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionListCursorSchema = v.strictObject({
  includeArchived: v.boolean(),
  id: apiPublicIdSchema,
  kind: v.literal("session-list"),
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  organizationId: apiPublicIdSchema,
  search: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  userId: apiPublicIdSchema,
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  version: v.literal(1),
})

export type SessionListCursor = v.InferOutput<typeof sessionListCursorSchema>
