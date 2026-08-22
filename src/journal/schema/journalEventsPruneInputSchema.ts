import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

const journalCursorSequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))

export const journalEventsPruneInputSchema = v.strictObject({
  afterSequence: v.optional(journalCursorSequenceSchema),
  userId: apiPublicIdSchema,
})

export type JournalEventsPruneInput = v.InferOutput<typeof journalEventsPruneInputSchema>
