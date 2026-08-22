import * as v from "valibot"

const nonNegativeSafeIntegerSchema = v.pipe(
  v.number(),
  v.check((value) => Number.isSafeInteger(value) && value >= 0, "The journal retention limit must be a safe integer."),
)

export const journalEventsPruneLimitsSchema = v.strictObject({
  maxAgeMs: nonNegativeSafeIntegerSchema,
  maxCount: nonNegativeSafeIntegerSchema,
  maxSerializedBytes: nonNegativeSafeIntegerSchema,
})

export type JournalEventsPruneLimits = v.InferOutput<typeof journalEventsPruneLimitsSchema>
