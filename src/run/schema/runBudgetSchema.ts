import * as v from "valibot"

const defaultMaxDurationMs = 300_000
const defaultMaxChildDepth = 0
const defaultMaxChildRuns = 0
const maxDurationMsSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(86_400_000))
const maxAttemptsSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))
const maxChildDepthSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3))
const maxChildRunsSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8))

export const runBudgetSchema = v.strictObject({
  maxAttempts: v.optional(maxAttemptsSchema, 1),
  maxChildDepth: v.optional(maxChildDepthSchema, defaultMaxChildDepth),
  maxChildRuns: v.optional(maxChildRunsSchema, defaultMaxChildRuns),
  maxDurationMs: v.optional(maxDurationMsSchema, defaultMaxDurationMs),
})

export type RunBudget = v.InferOutput<typeof runBudgetSchema>
