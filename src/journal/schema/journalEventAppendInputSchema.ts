import * as v from "valibot"
import { journalEventResourceSchema } from "./journalEventResourceSchema.js"
import { journalJsonValueSchema } from "./journalJsonValueSchema.js"

const journalEventTypeSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100), v.regex(/^[^\r\n]+$/))

export const journalEventAppendInputSchema = v.strictObject({
  eventType: journalEventTypeSchema,
  payload: journalJsonValueSchema,
  resource: journalEventResourceSchema,
})

export type JournalEventAppendInput = v.InferOutput<typeof journalEventAppendInputSchema>
