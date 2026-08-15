import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { ProviderModelSelectionPersistence } from "./schema/providerModelSelectionPersistenceSchema.js"
import type { ProviderModelSelection } from "./schema/providerModelSelectionSchema.js"

type ProviderModelSelectionCandidate = {
  efforts?: readonly NonNullable<ProviderModelSelection["reasoningEffort"]>[]
  id: string
  providerId?: ProviderModelSelection["provider"]
}

export function providerModelSelectionResolve(
  configuration: AgentConfiguration,
  models: readonly ProviderModelSelectionCandidate[],
  persistence: ProviderModelSelectionPersistence,
): ProviderModelSelection | null {
  const modelProvider = (model: ProviderModelSelectionCandidate) => model.providerId ?? configuration.provider
  const selectedProvider = persistence.selectedProvider ?? configuration.provider
  const persisted = persistence.selections.find((selection) => selection.provider === selectedProvider)
  const persistedModel = models.find(
    (model) => modelProvider(model) === persisted?.provider && model.id === persisted.model,
  )
  const configuredModel = models.find(
    (model) => modelProvider(model) === configuration.provider && model.id === configuration.model,
  )
  const selectedModel = persistedModel ?? configuredModel ?? models[0]
  if (selectedModel === undefined) return null

  const provider = modelProvider(selectedModel)
  const providerPersistence = persistence.selections.find((selection) => selection.provider === provider)
  const availableEfforts = selectedModel.efforts
  const effortCandidates = [
    providerPersistence?.model === selectedModel.id ? providerPersistence.reasoningEffort : undefined,
    provider === configuration.provider && selectedModel.id === configuration.model
      ? configuration.generation?.reasoningEffort
      : undefined,
    availableEfforts?.includes("medium") ? "medium" : availableEfforts?.[0],
  ]
  const reasoningEffort = effortCandidates.find(
    (effort) => effort !== undefined && (availableEfforts === undefined || availableEfforts.includes(effort)),
  )
  return {
    model: selectedModel.id,
    provider,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}
