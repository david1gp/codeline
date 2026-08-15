import * as v from "valibot"
import { providerCatalogSchema } from "../schema/providerCatalogSchema.js"

const providerSchema = providerCatalogSchema.entries.providers.item
const modelSchema = providerSchema.entries.models.item
const variantSchema = modelSchema.entries.variants.item

const providerApiCatalogVariantSchema = v.strictObject({
  effort: variantSchema.entries.effort,
  id: variantSchema.entries.id,
})

const providerApiCatalogModelSchema = v.strictObject({
  capabilities: modelSchema.entries.capabilities,
  cost: modelSchema.entries.cost,
  enabled: modelSchema.entries.enabled,
  family: modelSchema.entries.family,
  id: modelSchema.entries.id,
  limit: modelSchema.entries.limit,
  name: modelSchema.entries.name,
  providerId: modelSchema.entries.providerId,
  reasoning: modelSchema.entries.reasoning,
  selectable: v.boolean(),
  status: modelSchema.entries.status,
  variants: v.array(providerApiCatalogVariantSchema),
})

export const providerApiCatalogResponseSchema = v.strictObject({
  providers: v.array(
    v.strictObject({
      enabled: providerSchema.entries.enabled,
      id: providerSchema.entries.id,
      models: v.array(providerApiCatalogModelSchema),
      name: providerSchema.entries.name,
    }),
  ),
  revision: providerCatalogSchema.entries.revision,
})

export type ProviderApiCatalogResponse = v.InferOutput<typeof providerApiCatalogResponseSchema>
