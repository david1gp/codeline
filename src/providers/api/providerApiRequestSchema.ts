import * as v from "valibot"

export const providerApiRequestSchema = v.strictObject({})

export type ProviderApiRequest = v.InferOutput<typeof providerApiRequestSchema>
