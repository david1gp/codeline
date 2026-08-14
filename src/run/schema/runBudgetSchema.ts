import * as v from "valibot"

const defaultMaxDurationMs = 300_000
const maxDurationMsSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(86_400_000))
const maxAttemptsSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))

export const runBudgetSchema = v.strictObject({
  maxAttempts: v.optional(maxAttemptsSchema, 1),
  maxChildRuns: v.optional(v.literal(0), 0),
  maxDurationMs: v.optional(maxDurationMsSchema, defaultMaxDurationMs),
})

export type RunBudget = v.InferOutput<typeof runBudgetSchema>
