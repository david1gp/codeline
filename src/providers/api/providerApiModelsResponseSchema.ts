import * as v from "valibot"

const providerApiModelSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
})

export const providerApiModelsResponseSchema = v.strictObject({
  models: v.array(providerApiModelSchema),
})

export type ProviderApiModelsResponse = v.InferOutput<typeof providerApiModelsResponseSchema>
