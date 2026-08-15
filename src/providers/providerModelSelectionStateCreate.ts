import { createSignal } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import { providerModelSelectionResolve } from "./providerModelSelectionResolve.js"
import type { ProviderModelSelectionPersistence } from "./schema/providerModelSelectionPersistenceSchema.js"
import { providerModelSelectionPersistenceSchema } from "./schema/providerModelSelectionPersistenceSchema.js"
import type { ProviderModelSelection } from "./schema/providerModelSelectionSchema.js"

const emptyPersistence: ProviderModelSelectionPersistence = { selections: [] }

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

type ProviderModelSelectionCandidate = {
  efforts?: readonly NonNullable<ProviderModelSelection["reasoningEffort"]>[]
  id: string
  providerId?: ProviderModelSelection["provider"]
}

function providerModelSelectionPersistenceParse(value: unknown): ProviderModelSelectionPersistence {
  const result = v.safeParse(providerModelSelectionPersistenceSchema, value)
  return result.success ? result.output : emptyPersistence
}

export function providerModelSelectionStateCreate(
  configuration: () => AgentConfiguration,
  models: () => readonly ProviderModelSelectionCandidate[],
  initialPersistence: unknown = emptyPersistence,
) {
  const persistence = createSignalObject(providerModelSelectionPersistenceParse(initialPersistence))

  const selection = () => providerModelSelectionResolve(configuration(), models(), persistence.get())
  const modelFind = (provider: ProviderModelSelection["provider"], model: string) =>
    models().find(
      (candidate) => (candidate.providerId ?? configuration().provider) === provider && candidate.id === model,
    )
  const persistedSelection = () => {
    const currentSelection = selection()
    if (currentSelection === null) return null
    const selectedProvider = persistence.get().selectedProvider ?? configuration().provider
    if (selectedProvider !== currentSelection.provider) return null
    const persisted = persistence.get().selections.find((candidate) => candidate.provider === currentSelection.provider)
    return persisted !== undefined && modelFind(persisted.provider, persisted.model) !== undefined
      ? currentSelection
      : null
  }
  const modelSelect = (provider: ProviderModelSelection["provider"], model: string): boolean => {
    const selectedModel = modelFind(provider, model)
    if (selectedModel === undefined) return false

    const selections = persistence.get().selections.filter((candidate) => candidate.provider !== provider)
    const currentSelection = selection()
    const priorProviderSelection = persistence.get().selections.find((candidate) => candidate.provider === provider)
    const effortCandidates = [
      priorProviderSelection?.model === model ? priorProviderSelection.reasoningEffort : undefined,
      currentSelection?.reasoningEffort,
      selectedModel.efforts?.includes("medium") ? "medium" : selectedModel.efforts?.[0],
    ]
    const reasoningEffort = effortCandidates.find(
      (effort) =>
        effort !== undefined && (selectedModel.efforts === undefined || selectedModel.efforts.includes(effort)),
    )
    persistence.set({
      selectedProvider: provider,
      selections: [
        ...selections,
        {
          model,
          provider,
          ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
        },
      ],
    })
    return true
  }

  const reasoningEffortSelect = (reasoningEffort: NonNullable<ProviderModelSelection["reasoningEffort"]>): boolean => {
    const currentSelection = selection()
    if (currentSelection === null) return false
    const selectedModel = modelFind(currentSelection.provider, currentSelection.model)
    if (selectedModel === undefined || !selectedModel.efforts?.includes(reasoningEffort)) return false

    const selections = persistence
      .get()
      .selections.filter((candidate) => candidate.provider !== currentSelection.provider)
    persistence.set({
      selectedProvider: currentSelection.provider,
      selections: [
        ...selections,
        { model: currentSelection.model, provider: currentSelection.provider, reasoningEffort },
      ],
    })
    return true
  }

  return {
    modelSelect,
    reasoningEffortSelect,
    persistence: persistence.get,
    persistedSelection,
    selectedModel: () => selection()?.model ?? null,
    selection,
  }
}
