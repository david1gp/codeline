import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"

export const messageListRequestSchema = v.strictObject({
  cursor: v.optional(apiCursorSchema),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 50),
})

export type MessageListRequest = v.InferOutput<typeof messageListRequestSchema>
