import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"

export const messageQuerySchema = v.object({
  cursor: v.optional(apiCursorSchema),
  limit: v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(100)),
    "50",
  ),
})

export type MessageQuery = v.InferOutput<typeof messageQuerySchema>
