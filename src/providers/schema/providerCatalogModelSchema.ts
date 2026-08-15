import * as v from "valibot"
import { providerCatalogSchema } from "./providerCatalogSchema.js"

export const providerCatalogModelSchema = providerCatalogSchema.entries.providers.item.entries.models.item

export type ProviderCatalogModel = v.InferOutput<typeof providerCatalogModelSchema>
