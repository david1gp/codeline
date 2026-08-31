import * as v from "valibot"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"

export const sessionBoundedHistoryQuerySchema = v.object({
  cursor: sessionOlderPageCursorSchema,
  limit: v.optional(
    v.union([
      v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(25)),
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
    ]),
    25,
  ),
})

export type SessionBoundedHistoryQuery = v.InferOutput<typeof sessionBoundedHistoryQuerySchema>
