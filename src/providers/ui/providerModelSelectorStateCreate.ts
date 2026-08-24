import type { Accessor } from "solid-js"
import { useContext } from "solid-js"
import { createMemo, untrack } from "solid-js/dist/solid.js"
import type { AgentDetailResponseV2 } from "../../agents/api/agentDetailResponseV2Schema.js"
import { agentDetailFetch } from "../../agents/client/agentDetailFetch.js"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import type { SessionDetailResponse } from "../../session/api/sessionDetailResponseSchema.js"
import { sessionDetailFetch } from "../../session/ui/sessionDetailFetch.js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import { appShellContext } from "../../ui/appShellContext.js"
import { httpQueryAccountCacheCreate } from "../../ui/httpQueryAccountCacheCreate.js"
import { httpQueryDataStatusResolve } from "../../ui/httpQueryDataStatusResolve.js"
import { httpQueryRepresentationResolve } from "../../ui/httpQueryRepresentationResolve.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { ProviderApiCatalogResponse } from "../api/providerApiCatalogResponseSchema.js"
import { providerCatalogFetch } from "../client/providerCatalogFetch.js"
import { providerModelSelectionStateCreate } from "../providerModelSelectionStateCreate.js"
import type { ProviderModelSelection } from "../schema/providerModelSelectionSchema.js"

const providerModelSelectionStorageKey = "codeline.provider-model-selection"
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
  /** Scopes the shared revision/ETag cache; defaults to the signed-in application user. */
  accountId?: Accessor<string | null>
  agentId?: Accessor<string | null>
  fetch?: ProviderModelSelectorFetch
  isOnline?: Accessor<boolean>
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

function providerModelSelectorValueCreate(provider: string, model: string): string {
  return `${encodeURIComponent(provider)}/${encodeURIComponent(model)}`
}

function providerModelSelectorGroupsCreate(catalog: ProviderApiCatalogResponse): ProviderModelSelectorGroup[] {
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
  const account = useContext(applicationAccountContext)
  const shell = useContext(appShellContext)
  const isOnline = options.isOnline ?? (() => shell === undefined || shell.pwa.status() !== "offline")
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? account?.userId() ?? null)

  // Reads go through the shared typed clients and the account-scoped revision/ETag cache, so a
  // retained catalog or session target stays selectable while a revalidation is in flight or failing.
  const catalogQuery = httpQueryStateCreate<ProviderApiCatalogResponse>({
    cache: accountCache.cache,
    key: () => accountCache.keyCreate("/api/providers/catalog"),
    load: (_key, signal, cached) =>
      providerCatalogFetch({
        fetch: fetchImplementation,
        signal,
        ...(cached?.etag === undefined ? {} : { etag: cached.etag }),
      }),
  })

  const sessionQuery = httpQueryStateCreate<SessionDetailResponse>({
    cache: accountCache.cache,
    key: () => {
      const sessionId = options.sessionId()
      return sessionId === null ? undefined : accountCache.keyCreate(`/api/sessions/${encodeURIComponent(sessionId)}`)
    },
    load: async (_key, signal) =>
      httpQueryRepresentationResolve(
        await sessionDetailFetch(untrack(() => options.sessionId()) ?? "", { fetch: fetchImplementation, signal }),
      ),
  })

  // The session shell names its execution target; the agent representation carries the
  // configured provider and model that the selector highlights and falls back to.
  const sessionTarget = () => {
    const detail = sessionQuery.data()
    return detail === undefined ? undefined : { agentId: detail.agent.id, serverId: detail.session.serverId }
  }
  const agentQuery = httpQueryStateCreate<AgentDetailResponseV2>({
    cache: accountCache.cache,
    key: () => {
      const target = sessionTarget()
      if (target === undefined) return undefined
      return accountCache.keyCreate(
        `/api/servers/${encodeURIComponent(target.serverId)}/agents/${encodeURIComponent(target.agentId)}`,
      )
    },
    load: async (_key, signal) => {
      const target = untrack(sessionTarget)
      const result = await agentDetailFetch(target?.serverId ?? "", target?.agentId ?? "", {
        fetch: fetchImplementation,
        signal,
      })
      if (result.success && result.data === undefined)
        return { success: false as const, op: "agentDetailFetch", errorMessage: "The session agent is unavailable." }
      return httpQueryRepresentationResolve(result as typeof result & { success: true; data: AgentDetailResponseV2 })
    },
  })

  const configuration = (): AgentConfiguration => agentQuery.data()?.agent.configuration ?? placeholderConfiguration
  const catalogGroups = createMemo(() => {
    const catalog = catalogQuery.data()
    return catalog === undefined ? undefined : providerModelSelectorGroupsCreate(catalog)
  })
  const groups = () => catalogGroups() ?? []
  const models = () => groups().flatMap((group) => group.models)
  const status = (): ProviderModelSelectorStatus => {
    const catalog = catalogGroups()
    if (catalog !== undefined) return catalog.length === 0 ? "error" : "ready"
    return catalogQuery.isError() ? "error" : "loading"
  }
  const selection = providerModelSelectionStateCreate(
    configuration,
    models,
    providerModelSelectionPersistenceRead(storage),
  )

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
      const persisted = status() === "ready" ? selection.persistedSelection() : null
      const currentSelection = selection.selection()
      const configured = configuration()
      const fallback =
        status() === "ready" &&
        currentSelection !== null &&
        (currentSelection.provider !== configured.provider || currentSelection.model !== configured.model)
          ? currentSelection
          : null
      const execution = persisted ?? fallback
      if (execution === null) return null
      const agentId = options.agentId?.() ?? null
      if (agentId === null) return execution
      // An open session executes against its own agent, not the sidebar selection that
      // only names the agent for a new session. Naming the wrong agent makes the server
      // reject the run as a mismatched execution override.
      const sessionAgentId = sessionTarget()?.agentId ?? null
      if (sessionAgentId === null) return { ...execution, agentId }
      // An agent whose configured provider is absent from the catalog is not switchable:
      // the server keeps such an agent on its own runtime and rejects a cross-provider
      // override, so the session must run with no override at all.
      if (!groups().some((group) => group.id === configured.provider)) return null
      return { ...execution, agentId: sessionAgentId }
    },
    configuredModel: () => configuration().model,
    /** Retained-data lifecycle of the catalog and session-target representations. */
    dataStatus: () =>
      httpQueryDataStatusResolve({
        isOnline: isOnline(),
        queries: options.sessionId() === null ? [catalogQuery] : [catalogQuery, sessionQuery, agentQuery],
      }),
    effortOptions: () => selectedModelEntry()?.efforts ?? [],
    groups,
    modelSelect,
    modelValueSelect,
    models,
    provider: () => configuration().provider,
    reasoningEffortSelect,
    reasoningEffortValueSelect,
    refresh: () => {
      catalogQuery.refresh()
      sessionQuery.refresh()
      agentQuery.refresh()
    },
    selectedModel: selection.selectedModel,
    selectedModelValue: () => selectedModelEntry()?.value ?? "",
    selectedProvider: () => selection.selection()?.provider ?? null,
    selectedReasoningEffort: () => selection.selection()?.reasoningEffort ?? null,
    status,
  }
}

export type ProviderModelSelectorState = ReturnType<typeof providerModelSelectorStateCreate>
