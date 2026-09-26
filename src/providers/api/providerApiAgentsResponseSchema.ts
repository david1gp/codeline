import * as v from "valibot"
import { providerCatalogSchema } from "../schema/providerCatalogSchema.js"

const agentSchema = providerCatalogSchema.entries.agents.item

export const providerApiAgentsResponseSchema = v.strictObject({
  agents: v.array(v.strictObject({
    id: agentSchema.entries.id,
    description: agentSchema.entries.description,
    enabled: agentSchema.entries.enabled,
    mode: agentSchema.entries.mode,
    provider: v.optional(providerCatalogSchema.entries.providers.item.entries.id),
    model: v.optional(providerCatalogSchema.entries.providers.item.entries.models.item.entries.id),
  })),
})

export type ProviderApiAgentsResponse = v.InferOutput<typeof providerApiAgentsResponseSchema>
