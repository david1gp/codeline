import * as v from "valibot"

export const journalCursorSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(2_048), v.regex(/^[^\s\r\n]+$/))

export type JournalCursor = v.InferOutput<typeof journalCursorSchema>
