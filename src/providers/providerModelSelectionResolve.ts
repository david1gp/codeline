import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { ProviderDiscoveredModel } from "./runtime/providerModelDiscovery.js"
import type { ProviderModelSelectionPersistence } from "./schema/providerModelSelectionPersistenceSchema.js"
import type { ProviderModelSelection } from "./schema/providerModelSelectionSchema.js"

export function providerModelSelectionResolve(
  configuration: AgentConfiguration,
  models: readonly ProviderDiscoveredModel[],
  persistence: ProviderModelSelectionPersistence,
): ProviderModelSelection | null {
  const persisted = persistence.selections.find((selection) => selection.provider === configuration.provider)
  const candidates = [persisted?.model, configuration.model, models[0]?.id]
  const model = candidates.find((candidate) => candidate !== undefined && models.some((item) => item.id === candidate))
  if (model === undefined) return null
  return {
    model,
    provider: configuration.provider,
    ...(persisted?.reasoningEffort === undefined && configuration.generation?.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: persisted?.reasoningEffort ?? configuration.generation?.reasoningEffort }),
  }
}
