import type { Accessor } from "solid-js"
import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { providerModelSelectionStateCreate } from "../providerModelSelectionStateCreate.js"
import type { ProviderModelSelection } from "../schema/providerModelSelectionSchema.js"
import { providerApiCatalogResponseSchema } from "../api/providerApiCatalogResponseSchema.js"
import { providerApiConnectionTestResponseSchema } from "../api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../api/providerApiModelsResponseSchema.js"

const providerModelSelectionStorageKey = "codeline.provider-model-selection"
const sessionProviderResponseSchema = v.object({
  agent: v.object({ configuration: agentConfigurationSchema }),
})
const placeholderConfiguration: AgentConfiguration = { model: "unavailable", provider: "deterministic" }
const supportedProviders = new Set<ProviderModelSelection["provider"]>(["cliproxyapi", "codex-lb", "deterministic"])
type ProviderModelSelectorEffort = NonNullable<ProviderModelSelection["reasoningEffort"]>
const supportedEfforts = new Set<ProviderModelSelectorEffort>(["low", "medium", "high", "xhigh", "max"])

type ProviderModelSelectorStatus = "idle" | "loading" | "ready" | "error"
type ProviderModelSelectorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ProviderModelSelectorModel = {
  efforts: ProviderModelSelectorEffort[]
  id: string
  name: string
  providerId: ProviderModelSelection["provider"]
  value: string
}
type ProviderModelSelectorGroup = {
  id: ProviderModelSelection["provider"]
  models: ProviderModelSelectorModel[]
  name: string
}

type ProviderModelSelectorStateOptions = {
  agentId?: Accessor<string | null>
  fetch?: ProviderModelSelectorFetch
  sessionId: Accessor<string | null>
  storage?: Pick<Storage, "getItem" | "setItem">
}

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

function providerModelSelectionPersistenceRead(storage: ProviderModelSelectorStateOptions["storage"]): unknown {
  if (storage === undefined) return undefined

  try {
    const stored = storage.getItem(providerModelSelectionStorageKey)
    return stored === null ? undefined : JSON.parse(stored)
  } catch (_error) {
    return undefined
  }
}

function providerModelSelectorValueCreate(provider: string, model: string): string {
  return `${encodeURIComponent(provider)}/${encodeURIComponent(model)}`
}

function providerModelSelectorGroupsCreate(
  catalog: v.InferOutput<typeof providerApiCatalogResponseSchema>,
): ProviderModelSelectorGroup[] {
  return [...catalog.providers]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((provider) => {
      if (!supportedProviders.has(provider.id as ProviderModelSelection["provider"])) return []
      const providerId = provider.id as ProviderModelSelection["provider"]
      const models = [...provider.models]
        .filter((model) => model.selectable && model.providerId === provider.id)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((model) => {
          const efforts = [...model.variants]
            .sort((left, right) => left.id.localeCompare(right.id))
            .flatMap((variant): ProviderModelSelectorEffort[] =>
              variant.effort !== undefined && (supportedEfforts as ReadonlySet<string>).has(variant.effort)
                ? [variant.effort as ProviderModelSelectorEffort]
                : [],
            )
            .filter((effort, index, values) => values.indexOf(effort) === index)
          return {
            efforts,
            id: model.id,
            name: model.name,
            providerId,
            value: providerModelSelectorValueCreate(providerId, model.id),
          }
        })
      return models.length === 0 ? [] : [{ id: providerId, models, name: provider.name }]
    })
}

export function providerModelSelectorStateCreate(options: ProviderModelSelectorStateOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const storage = options.storage ?? globalThis.localStorage
  const configuration = createSignalObject<AgentConfiguration>(placeholderConfiguration)
  const groups = createSignalObject<ProviderModelSelectorGroup[]>([])
  const status = createSignalObject<ProviderModelSelectorStatus>("idle")
  const models = () => groups.get().flatMap((group) => group.models)
  const selection = providerModelSelectionStateCreate(
    configuration.get,
    models,
    providerModelSelectionPersistenceRead(storage),
  )

  createEffect(() => {
    const sessionId = options.sessionId()
    groups.set([])
    if (sessionId === null) {
      status.set("idle")
      return
    }

    const controller = new AbortController()
    status.set("loading")
    void (async () => {
      try {
        const [sessionResponse, catalogResult] = await Promise.all([
          fetchImplementation(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal: controller.signal }),
          fetchImplementation("/api/providers/catalog", {
            credentials: "same-origin",
            signal: controller.signal,
          })
            .then(async (response) => ({ body: await response.json(), response }))
            .catch(() => undefined),
        ])
        const sessionBody: unknown = await sessionResponse.json()
        const parsedSession = v.safeParse(sessionProviderResponseSchema, sessionBody)
        if (!sessionResponse.ok || !parsedSession.success) {
          status.set("error")
          return
        }
        configuration.set(parsedSession.output.agent.configuration)

        const parsedCatalog = v.safeParse(providerApiCatalogResponseSchema, catalogResult?.body)
        if (catalogResult?.response.ok && parsedCatalog.success) {
          const catalogGroups = providerModelSelectorGroupsCreate(parsedCatalog.output)
          groups.set(catalogGroups)
          status.set(catalogGroups.length === 0 ? "error" : "ready")
          return
        }

        const [modelsResponse, connectionResponse] = await Promise.all([
          fetchImplementation("/api/providers/models", {
            body: "{}",
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: controller.signal,
          }),
          fetchImplementation("/api/providers/connection-test", {
            body: "{}",
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: controller.signal,
          }),
        ])
        const [modelsBody, connectionBody]: unknown[] = await Promise.all([
          modelsResponse.json(),
          connectionResponse.json(),
        ])
        const parsedModels = v.safeParse(providerApiModelsResponseSchema, modelsBody)
        const parsedConnection = v.safeParse(providerApiConnectionTestResponseSchema, connectionBody)
        const currentConfiguration = parsedSession.output.agent.configuration
        if (
          !modelsResponse.ok ||
          !connectionResponse.ok ||
          !parsedModels.success ||
          !parsedConnection.success ||
          parsedConnection.output.provider !== currentConfiguration.provider ||
          parsedConnection.output.model !== currentConfiguration.model ||
          parsedModels.output.models.length === 0
        ) {
          status.set("error")
          return
        }

        const legacyEfforts = [...supportedEfforts]
        groups.set([
          {
            id: currentConfiguration.provider,
            models: parsedModels.output.models.map((model) => ({
              efforts: legacyEfforts,
              id: model.id,
              name: model.name ?? model.id,
              providerId: currentConfiguration.provider,
              value: providerModelSelectorValueCreate(currentConfiguration.provider, model.id),
            })),
            name: currentConfiguration.provider,
          },
        ])
        status.set("ready")
      } catch (_error) {
        if (!controller.signal.aborted) status.set("error")
      }
    })()
    onCleanup(() => controller.abort())
  })

  const persistenceWrite = () => {
    try {
      storage?.setItem(providerModelSelectionStorageKey, JSON.stringify(selection.persistence()))
    } catch (_error) {
      // The in-memory selection remains useful when browser storage is unavailable.
    }
  }
  const modelSelect = (provider: ProviderModelSelection["provider"], model: string) => {
    if (!selection.modelSelect(provider, model)) return
    persistenceWrite()
  }
  const modelValueSelect = (value: string) => {
    const model = models().find((candidate) => candidate.value === value)
    if (model !== undefined) modelSelect(model.providerId, model.id)
  }
  const reasoningEffortSelect = (reasoningEffort: NonNullable<ProviderModelSelection["reasoningEffort"]>) => {
    if (!selection.reasoningEffortSelect(reasoningEffort)) return
    persistenceWrite()
  }
  const reasoningEffortValueSelect = (reasoningEffort: string) => {
    if (!(supportedEfforts as ReadonlySet<string>).has(reasoningEffort)) return
    reasoningEffortSelect(reasoningEffort as ProviderModelSelectorEffort)
  }
  const selectedModelEntry = () => {
    const selected = selection.selection()
    return selected === null
      ? undefined
      : models().find((model) => model.providerId === selected.provider && model.id === selected.model)
  }

  return {
    codelineExecution: () => {
      const persisted = status.get() === "ready" ? selection.persistedSelection() : null
      const currentSelection = selection.selection()
      const configured = configuration.get()
      const fallback =
        status.get() === "ready" &&
        currentSelection !== null &&
        (currentSelection.provider !== configured.provider || currentSelection.model !== configured.model)
          ? currentSelection
          : null
      const execution = persisted ?? fallback
      if (execution === null) return null
      const agentId = options.agentId?.() ?? null
      return agentId === null ? execution : { ...execution, agentId }
    },
    configuredModel: () => configuration.get().model,
    effortOptions: () => selectedModelEntry()?.efforts ?? [],
    groups: groups.get,
    modelSelect,
    modelValueSelect,
    models,
    provider: () => configuration.get().provider,
    reasoningEffortSelect,
    reasoningEffortValueSelect,
    selectedModel: selection.selectedModel,
    selectedModelValue: () => selectedModelEntry()?.value ?? "",
    selectedProvider: () => selection.selection()?.provider ?? null,
    selectedReasoningEffort: () => selection.selection()?.reasoningEffort ?? null,
    status: status.get,
  }
}

export type ProviderModelSelectorState = ReturnType<typeof providerModelSelectorStateCreate>
