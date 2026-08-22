import * as v from "valibot"

export const journalEventIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(2_048), v.regex(/^[^\s\r\n]+$/))

export type JournalEventId = v.InferOutput<typeof journalEventIdSchema>
