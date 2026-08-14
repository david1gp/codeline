import { createSignal } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import { providerModelSelectionResolve } from "./providerModelSelectionResolve.js"
import type { ProviderDiscoveredModel } from "./runtime/providerModelDiscovery.js"
import type { ProviderModelSelectionPersistence } from "./schema/providerModelSelectionPersistenceSchema.js"
import { providerModelSelectionPersistenceSchema } from "./schema/providerModelSelectionPersistenceSchema.js"

const emptyPersistence: ProviderModelSelectionPersistence = { selections: [] }

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

function providerModelSelectionPersistenceParse(value: unknown): ProviderModelSelectionPersistence {
  const result = v.safeParse(providerModelSelectionPersistenceSchema, value)
  return result.success ? result.output : emptyPersistence
}

export function providerModelSelectionStateCreate(
  configuration: () => AgentConfiguration,
  models: () => readonly ProviderDiscoveredModel[],
  initialPersistence: unknown = emptyPersistence,
) {
  const persistence = createSignalObject(providerModelSelectionPersistenceParse(initialPersistence))

  const selection = () => providerModelSelectionResolve(configuration(), models(), persistence.get())
  const persistedSelection = () => {
    const currentConfiguration = configuration()
    const persisted = persistence
      .get()
      .selections.find((candidate) => candidate.provider === currentConfiguration.provider)
    return persisted !== undefined && models().some((candidate) => candidate.id === persisted.model) ? persisted : null
  }
  const modelSelect = (model: string): boolean => {
    const currentConfiguration = configuration()
    if (!models().some((candidate) => candidate.id === model)) return false

    const selections = persistence
      .get()
      .selections.filter((candidate) => candidate.provider !== currentConfiguration.provider)
    persistence.set({
      selections: [...selections, { model, provider: currentConfiguration.provider }],
    })
    return true
  }

  return {
    modelSelect,
    persistence: persistence.get,
    persistedSelection,
    selectedModel: () => selection()?.model ?? null,
    selection,
  }
}
