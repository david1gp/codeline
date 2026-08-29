import * as v from "valibot"
import { compactionConfigurationDefaults } from "./compactionConfigurationDefaults.js"

const positiveTokenCountSchema = v.pipe(
  v.number(),
  v.check((value) => Number.isSafeInteger(value) && value >= 1, "Must be a positive safe integer."),
)

const pressureThresholdSchema = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value) && value > 0 && value <= 1, "Must be greater than 0 and at most 1."),
)

const overflowRetryCountSchema = v.pipe(
  v.number(),
  v.check((value) => Number.isSafeInteger(value) && value >= 0 && value <= 3, "Must be an integer from 0 through 3."),
)

export const compactionConfigurationSchema = v.pipe(
  v.strictObject({
    auto: v.optional(v.boolean(), compactionConfigurationDefaults.auto),
    enabled: v.optional(v.boolean(), compactionConfigurationDefaults.enabled),
    maxOverflowRetries: v.optional(overflowRetryCountSchema, compactionConfigurationDefaults.maxOverflowRetries),
    maxSummaryTokens: v.optional(positiveTokenCountSchema, compactionConfigurationDefaults.maxSummaryTokens),
    pressureThreshold: v.optional(pressureThresholdSchema, compactionConfigurationDefaults.pressureThreshold),
    recentTokenBudget: v.optional(positiveTokenCountSchema, compactionConfigurationDefaults.recentTokenBudget),
    reserveOutputTokens: v.optional(positiveTokenCountSchema, compactionConfigurationDefaults.reserveOutputTokens),
  }),
  v.check(
    (configuration) => configuration.maxSummaryTokens <= configuration.reserveOutputTokens,
    "maxSummaryTokens must be no greater than reserveOutputTokens.",
  ),
)

export type CompactionConfiguration = v.InferOutput<typeof compactionConfigurationSchema>
