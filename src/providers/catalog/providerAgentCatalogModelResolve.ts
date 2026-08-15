import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"

type CatalogAgent = ProviderCatalog["agents"][number]
type CatalogModel = ProviderCatalog["providers"][number]["models"][number]

type ProviderAgentCatalogModelResolution = {
  agent: CatalogAgent
  model: CatalogModel
  provider: ProviderCatalog["providers"][number]
  variant?: CatalogModel["variants"][number]
}

const defaultProviderId = "codex-lb"
const defaultModelId = "gpt-5.6-luna"

function catalogModelsFind(
  catalog: ProviderCatalog,
  modelId: string,
): Array<{
  model: CatalogModel
  provider: ProviderCatalog["providers"][number]
}> {
  return catalog.providers.flatMap((provider) =>
    provider.models.filter((model) => model.id === modelId).map((model) => ({ model, provider })),
  )
}

function providerFind(catalog: ProviderCatalog, providerId: string): ProviderCatalog["providers"][number] | undefined {
  return catalog.providers.find((provider) => provider.id === providerId)
}

function defaultModelResolve(catalog: ProviderCatalog): Result<{
  model: CatalogModel
  provider: ProviderCatalog["providers"][number]
}> {
  const provider = providerFind(catalog, defaultProviderId)
  const model = provider?.models.find((item) => item.id === defaultModelId)
  if (provider !== undefined && model !== undefined) return createResult({ model, provider })
  return createResultError("providerAgentCatalogModelResolve", "The catalog default model is unavailable.")
}

function agentModelResolve(
  catalog: ProviderCatalog,
  agent: CatalogAgent,
): Result<{ model: CatalogModel; provider: ProviderCatalog["providers"][number] }> {
  if (agent.model === undefined && agent.provider === undefined) return defaultModelResolve(catalog)

  if (agent.model === undefined) {
    const provider = providerFind(catalog, agent.provider ?? "")
    if (provider === undefined) {
      return createResultError("providerAgentCatalogModelResolve", "The catalog agent provider is unavailable.")
    }
    const defaultModel = provider.models.find((model) => model.id === defaultModelId)
    const model = defaultModel ?? provider.models.find((item) => item.enabled)
    if (model === undefined)
      return createResultError("providerAgentCatalogModelResolve", "The catalog provider has no model.")
    return createResult({ model, provider })
  }

  const candidates = catalogModelsFind(catalog, agent.model)
  const filtered =
    agent.provider === undefined ? candidates : candidates.filter(({ provider }) => provider.id === agent.provider)
  if (filtered.length !== 1) {
    return createResultError("providerAgentCatalogModelResolve", "The catalog agent model is unavailable or ambiguous.")
  }
  const selected = filtered[0]
  if (selected === undefined)
    return createResultError("providerAgentCatalogModelResolve", "The catalog agent model is unavailable.")
  return createResult(selected)
}

function variantResolve(
  agent: CatalogAgent,
  model: CatalogModel,
): Result<CatalogModel["variants"][number] | undefined> {
  const variantId = agent.variant ?? agent.effort ?? agent.generation?.reasoningEffort
  if (variantId === undefined) return createResult(undefined)
  const variant = model.variants.find((item) => item.id === variantId || item.effort === variantId)
  if (variant === undefined)
    return createResultError("providerAgentCatalogModelResolve", "The catalog agent variant is unavailable.")
  return createResult(variant)
}

export function providerAgentCatalogModelResolve(
  catalog: ProviderCatalog,
  agent: CatalogAgent,
): Result<ProviderAgentCatalogModelResolution> {
  const selected = agentModelResolve(catalog, agent)
  if (!selected.success) return selected
  const variant = variantResolve(agent, selected.data.model)
  if (!variant.success) return variant
  return createResult({
    agent,
    model: selected.data.model,
    provider: selected.data.provider,
    ...(variant.data === undefined ? {} : { variant: variant.data }),
  })
}
