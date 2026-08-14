import type { Accessor } from "solid-js"
import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { providerApiConnectionTestResponseSchema } from "../api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../api/providerApiModelsResponseSchema.js"
import { providerModelSelectionStateCreate } from "../providerModelSelectionStateCreate.js"

const providerModelSelectionStorageKey = "codeline.provider-model-selection"
const sessionProviderResponseSchema = v.object({
  agent: v.object({ configuration: agentConfigurationSchema }),
})
const placeholderConfiguration: AgentConfiguration = { model: "unavailable", provider: "deterministic" }

type ProviderModelSelectorStatus = "idle" | "loading" | "ready" | "error"
type ProviderModelSelectorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type ProviderModelSelectorStateOptions = {
  fetch?: ProviderModelSelectorFetch
  sessionId: Accessor<string | null>
  storage?: Pick<Storage, "getItem" | "setItem">
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

function providerModelSelectorSignalCreate<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function providerModelSelectorStateCreate(options: ProviderModelSelectorStateOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const storage = options.storage ?? globalThis.localStorage
  const configuration = providerModelSelectorSignalCreate<AgentConfiguration>(placeholderConfiguration)
  const models = providerModelSelectorSignalCreate<v.InferOutput<typeof providerApiModelsResponseSchema>["models"]>([])
  const status = providerModelSelectorSignalCreate<ProviderModelSelectorStatus>("idle")
  const selection = providerModelSelectionStateCreate(
    configuration.get,
    models.get,
    providerModelSelectionPersistenceRead(storage),
  )

  createEffect(() => {
    const sessionId = options.sessionId()
    models.set([])
    if (sessionId === null) {
      status.set("idle")
      return
    }

    const controller = new AbortController()
    status.set("loading")
    void (async () => {
      try {
        const [sessionResponse, modelsResponse, connectionResponse] = await Promise.all([
          fetchImplementation(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal: controller.signal }),
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
        const [sessionBody, modelsBody, connectionBody]: unknown[] = await Promise.all([
          sessionResponse.json(),
          modelsResponse.json(),
          connectionResponse.json(),
        ])
        const parsedSession = v.safeParse(sessionProviderResponseSchema, sessionBody)
        const parsedModels = v.safeParse(providerApiModelsResponseSchema, modelsBody)
        const parsedConnection = v.safeParse(providerApiConnectionTestResponseSchema, connectionBody)
        if (
          !sessionResponse.ok ||
          !modelsResponse.ok ||
          !connectionResponse.ok ||
          !parsedSession.success ||
          !parsedModels.success ||
          !parsedConnection.success ||
          parsedConnection.output.provider !== parsedSession.output.agent.configuration.provider ||
          parsedConnection.output.model !== parsedSession.output.agent.configuration.model ||
          parsedModels.output.models.length === 0
        ) {
          status.set("error")
          return
        }

        configuration.set(parsedSession.output.agent.configuration)
        models.set(parsedModels.output.models)
        status.set("ready")
      } catch (_error) {
        if (!controller.signal.aborted) status.set("error")
      }
    })()
    onCleanup(() => controller.abort())
  })

  const modelSelect = (model: string) => {
    if (!selection.modelSelect(model)) return
    try {
      storage?.setItem(providerModelSelectionStorageKey, JSON.stringify(selection.persistence()))
    } catch (_error) {
      // The in-memory selection remains useful when browser storage is unavailable.
    }
  }

  return {
    codelineExecution: () => (status.get() === "ready" ? selection.persistedSelection() : null),
    configuredModel: () => configuration.get().model,
    modelSelect,
    models: models.get,
    provider: () => configuration.get().provider,
    selectedModel: selection.selectedModel,
    status: status.get,
  }
}

export type ProviderModelSelectorState = ReturnType<typeof providerModelSelectorStateCreate>
