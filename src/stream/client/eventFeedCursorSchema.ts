import * as v from "valibot"
import { journalCursorSchema } from "../../journal/schema/journalCursorSchema.js"

export const eventFeedCursorSchema = v.pipe(
  journalCursorSchema,
  v.check((cursor) => !/^\d+$/.test(cursor), "The event feed cursor must be opaque."),
)

export type EventFeedCursor = v.InferOutput<typeof eventFeedCursorSchema>
