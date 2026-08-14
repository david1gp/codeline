import * as v from "valibot"

const providerModelSelectionProviderSchema = v.picklist(["cliproxyapi", "codex-lb", "deterministic"])
const providerModelSelectionModelSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const providerModelSelectionSchema = v.strictObject({
  model: providerModelSelectionModelSchema,
  provider: providerModelSelectionProviderSchema,
})

export type ProviderModelSelection = v.InferOutput<typeof providerModelSelectionSchema>
