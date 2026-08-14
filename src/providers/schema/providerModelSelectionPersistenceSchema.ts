import * as v from "valibot"
import { providerModelSelectionSchema } from "./providerModelSelectionSchema.js"

export const providerModelSelectionPersistenceSchema = v.strictObject({
  selections: v.pipe(
    v.array(providerModelSelectionSchema),
    v.maxLength(3),
    v.check((selections) => new Set(selections.map((selection) => selection.provider)).size === selections.length),
  ),
})

export type ProviderModelSelectionPersistence = v.InferOutput<typeof providerModelSelectionPersistenceSchema>
