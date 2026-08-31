import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"

export const sessionOlderPageCursorSchema = v.pipe(
  apiCursorSchema,
  v.check((cursor) => !/^\d+$/.test(cursor), "The older-page cursor must be opaque."),
)

export type SessionOlderPageCursor = v.InferOutput<typeof sessionOlderPageCursorSchema>
