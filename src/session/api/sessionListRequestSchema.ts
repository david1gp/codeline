import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"

export const sessionListRequestSchema = v.strictObject({
  cursor: v.optional(apiCursorSchema),
  includeArchived: v.optional(v.boolean(), false),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 50),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

export type SessionListRequest = v.InferOutput<typeof sessionListRequestSchema>
