import * as v from "valibot"

export const providerGenerationSchema = v.strictObject({
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000))),
  reasoningEffort: v.optional(v.picklist(["low", "medium", "high", "xhigh", "max"])),
  temperature: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(2))),
})

export type ProviderGeneration = v.InferOutput<typeof providerGenerationSchema>
