import type { ProviderApiCatalogResponse } from "../api/providerApiCatalogResponseSchema.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"

export function providerAgentCatalogRedact(catalog: ProviderCatalog): ProviderApiCatalogResponse {
  return {
    providers: [...catalog.providers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((provider) => ({
        enabled: provider.enabled,
        id: provider.id,
        models: [...provider.models]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((model) => ({
            capabilities: model.capabilities,
            cost: model.cost,
            enabled: model.enabled,
            ...(model.family === undefined ? {} : { family: model.family }),
            id: model.id,
            limit: model.limit,
            name: model.name,
            providerId: model.providerId,
            reasoning: model.reasoning,
            selectable: provider.enabled && model.enabled,
            status: model.status,
            variants: [...model.variants]
              .sort((left, right) => left.id.localeCompare(right.id))
              .map((variant) => ({
                id: variant.id,
                ...(variant.effort === undefined ? {} : { effort: variant.effort }),
              })),
          })),
        name: provider.name,
      })),
    revision: catalog.revision,
  }
}
