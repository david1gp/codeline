import { createResultError, type Result } from "@adaptive-ds/result"
import type { Accessor } from "solid-js"
import { batch, createEffect, onCleanup, untrack } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { agentDetailResponseSchema, type AgentDetailResponse } from "../agents/api/agentDetailResponseSchema.js"
import type { AgentListResponse } from "../agents/api/agentListResponseSchema.js"
import { agentDetailFetch } from "../agents/client/agentDetailFetch.js"
import { agentListFetch } from "../agents/client/agentListFetch.js"
import { type AgentConfiguration, agentConfigurationSchema } from "../agents/schema/agentConfigurationSchema.js"
import { agentCreateRequestSchema } from "../agents/schema/agentCreateRequestSchema.js"
import { agentExecutionTargetSchema } from "../agents/schema/agentExecutionTargetSchema.js"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"
import { providerApiConnectionTestResponseSchema } from "../providers/api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../providers/api/providerApiModelsResponseSchema.js"
import type { ServerListResponse } from "../servers/api/serverListResponseSchema.js"
import { serverListFetch } from "../servers/client/serverListFetch.js"
import type { SessionDetailResponse } from "../session/api/sessionDetailResponseSchema.js"
import { sessionTargetCreateResponseSchema } from "../session/api/sessionTargetCreateResponseSchema.js"
import { sessionDetailFetch } from "../session/ui/sessionDetailFetch.js"
import { httpQueryAccountCacheCreate } from "./httpQueryAccountCacheCreate.js"
import { httpQueryRepresentationResolve } from "./httpQueryRepresentationResolve.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SessionTargetConfigurationView } from "./sessionTargetConfigurationView.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionTargetSelectorStatus = "loading" | "ready" | "empty" | "error"
/** Retained-data lifecycle of the server/agent representations backing this selector. */
type SessionTargetSelectorDataStatus = "offline" | "reconciling" | "ready" | "stale"
type SessionTargetSelectorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type SessionTargetServer = ServerListResponse["servers"][number]
type SessionTargetAgent = AgentListResponse["agents"][number]
type ConfigurableProvider = "cliproxyapi" | "codex-lb"
type AgentDetail = AgentDetailResponse["agent"]
type AgentDraft = {
  baseUrl: string
  generation?: AgentConfiguration["generation"]
  model: string
  name: string
  provider: ConfigurableProvider
  role: string
  secretReference: "$CLIPROXYAPI_API_KEY" | "$CODEX_LB_API_TOKEN"
}

type SessionTargetSelectorStateOptions = {
  /** Scopes the shared revision/ETag cache to the signed-in application user. */
  accountId?: Accessor<string | null>
  activeProjectPath?: Accessor<string | null>
  clientRequestIdCreate?: () => string
  fetch?: SessionTargetSelectorFetch
  isNewSessionRoute?: Accessor<boolean>
  isOnline?: Accessor<boolean>
  selectedSessionId: Accessor<string | null>
  sessionNew?: () => void
  sessionSelect: (sessionId: string) => void
  storage?: Pick<Storage, "getItem" | "setItem">
}

const agentDraftEmpty = (): AgentDraft => ({
  baseUrl: "",
  model: "",
  name: "",
  provider: "codex-lb",
  role: "coding",
  secretReference: "$CODEX_LB_API_TOKEN",
})

const sessionTargetSelectionStorageKey = "codeline.session-target-selection"

function sessionTargetSelectionRead(storage: SessionTargetSelectorStateOptions["storage"]): Record<string, string> {
  if (storage === undefined) return {}
  try {
    const value: unknown = JSON.parse(storage.getItem(sessionTargetSelectionStorageKey) ?? "null")
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        ([serverId, agentId]) => typeof serverId === "string" && typeof agentId === "string",
      ),
    )
  } catch (_error) {
    return {}
  }
}

function sessionTargetSelectionStorageResolve(
  storage: SessionTargetSelectorStateOptions["storage"],
): SessionTargetSelectorStateOptions["storage"] {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage
  } catch (_error) {
    return undefined
  }
}

function agentDraftFromDetail(agent: AgentDetail): AgentDraft | null {
  const configuration = agent.configuration
  if (configuration.provider === "deterministic") return null
  return {
    baseUrl: configuration.baseUrl,
    generation: configuration.generation,
    model: configuration.model,
    name: agent.name,
    provider: configuration.provider,
    role: agent.role,
    secretReference: configuration.provider === "codex-lb" ? "$CODEX_LB_API_TOKEN" : "$CLIPROXYAPI_API_KEY",
  }
}

function agentDraftConfiguration(draft: AgentDraft): AgentConfiguration {
  const generation = draft.generation === undefined ? {} : { generation: draft.generation }
  if (draft.provider === "cliproxyapi") {
    return {
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: draft.baseUrl,
      model: draft.model,
      provider: draft.provider,
      ...generation,
    }
  }
  return {
    apiKey: "$CODEX_LB_API_TOKEN",
    baseUrl: draft.baseUrl,
    model: draft.model,
    provider: draft.provider,
    ...generation,
  }
}

function apiErrorMessageResolve(body: unknown, fallback: string): string {
  const parsed = v.safeParse(apiErrorResponseSchema, body)
  return parsed.success ? parsed.output.error.message : fallback
}

export function sessionTargetSelectorStateCreate(options: SessionTargetSelectorStateOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const clientRequestIdCreate = options.clientRequestIdCreate ?? (() => crypto.randomUUID())
  const storage = sessionTargetSelectionStorageResolve(options.storage)
  const activeProjectPath = options.activeProjectPath ?? (() => "~")
  const savedSelections = sessionTargetSelectionRead(storage)
  const servers = signalObjectCreate<SessionTargetServer[]>([])
  const agents = signalObjectCreate<SessionTargetAgent[]>([])
  const serverStatus = signalObjectCreate<SessionTargetSelectorStatus>("loading")
  const agentStatus = signalObjectCreate<SessionTargetSelectorStatus>("loading")
  const selectedServerId = signalObjectCreate<string | null>(null)
  const selectedAgentId = signalObjectCreate<string | null>(null)
  const sessionCreateStatus = signalObjectCreate<"idle" | "creating" | "error">("idle")
  const sessionCreateErrorMessage = signalObjectCreate<string | undefined>(undefined)
  const agentDetail = signalObjectCreate<AgentDetail | null>(null)
  const agentDetailStatus = signalObjectCreate<"idle" | "loading" | "ready" | "error">("idle")
  const agentDraft = signalObjectCreate<AgentDraft>(agentDraftEmpty())
  const agentCreateMode = signalObjectCreate(false)
  const configurationErrorMessage = signalObjectCreate<string | null>(null)
  const models = signalObjectCreate<v.InferOutput<typeof providerApiModelsResponseSchema>["models"]>([])
  const modelsStatus = signalObjectCreate<"idle" | "loading" | "success" | "error">("idle")
  const connectionTest = signalObjectCreate<v.InferOutput<typeof providerApiConnectionTestResponseSchema> | null>(null)
  const connectionTestStatus = signalObjectCreate<"idle" | "testing" | "success" | "error">("idle")
  const saveStatus = signalObjectCreate<"idle" | "saving" | "success" | "error">("idle")

  // The pending create intent keeps one client request id so that a retry after an ambiguous
  // failure stays idempotent on the server until the create succeeds or the target changes.
  let pendingCreateKey: string | null = null
  let pendingCreateRequestId: string | null = null
  let sessionCreateGeneration = 0
  let automaticCreateKey: string | null = null
  let automaticRouteIsNew: boolean | undefined
  let sessionCreateInFlight: {
    generation: number
    key: string
    promise: Promise<string | null>
  } | null = null
  let isDisposed = false
  const sessionCreateTargetInvalidate = () => {
    sessionCreateGeneration += 1
    automaticCreateKey = null
    if (sessionCreateStatus.get() === "creating") sessionCreateStatus.set("idle")
    sessionCreateErrorMessage.set(undefined)
  }
  const selectedServerIdSet = (serverId: string | null) => {
    const changed = selectedServerId.get() !== serverId
    batch(() => {
      selectedServerId.set(serverId)
      if (changed) sessionCreateTargetInvalidate()
    })
  }
  const selectedAgentIdSet = (agentId: string | null) => {
    const changed = selectedAgentId.get() !== agentId
    batch(() => {
      selectedAgentId.set(agentId)
      if (changed) sessionCreateTargetInvalidate()
    })
  }
  onCleanup(() => {
    isDisposed = true
  })

  // Reads go through the typed clients and the shared account-scoped revision/ETag cache so a
  // retained representation stays rendered while a revalidation or a failure is reported separately.
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? null)

  const serverQuery = httpQueryStateCreate<ServerListResponse>({
    cache: accountCache.cache,
    key: () => accountCache.keyCreate("/api/servers"),
    load: async (_key, signal) =>
      httpQueryRepresentationResolve(await serverListFetch({ fetch: fetchImplementation, signal })),
  })

  const agentListQuery = httpQueryStateCreate<AgentListResponse>({
    cache: accountCache.cache,
    key: () => {
      const serverId = selectedServerId.get()
      return serverId === null
        ? undefined
        : accountCache.keyCreate(`/api/servers/${encodeURIComponent(serverId)}/agents`)
    },
    load: async (_key, signal) => {
      const serverId = untrack(() => selectedServerId.get()) ?? ""
      return httpQueryRepresentationResolve(await agentListFetch(serverId, { fetch: fetchImplementation, signal }))
    },
  })

  const agentDetailQuery = httpQueryStateCreate<AgentDetailResponse>({
    cache: accountCache.cache,
    key: () => {
      const serverId = selectedServerId.get()
      const agentId = selectedAgentId.get()
      if (serverId === null || agentId === null || agentCreateMode.get()) return undefined
      return accountCache.keyCreate(
        `/api/servers/${encodeURIComponent(serverId)}/agents/${encodeURIComponent(agentId)}`,
      )
    },
    load: async (_key, signal) => {
      const serverId = untrack(() => selectedServerId.get()) ?? ""
      const agentId = untrack(() => selectedAgentId.get()) ?? ""
      const result = await agentDetailFetch(serverId, agentId, { fetch: fetchImplementation, signal })
      if (result.success && result.data === undefined) {
        return createResultError("agentDetailFetch", "The selected agent could not be loaded.")
      }
      return httpQueryRepresentationResolve(result as Result<AgentDetailResponse>)
    },
  })

  createEffect(() => {
    const list = serverQuery.data()?.servers
    const isError = serverQuery.isError()
    if (list === undefined) {
      servers.set([])
      if (!isError) {
        serverStatus.set("loading")
        return
      }
      configurationErrorMessage.set(serverQuery.errorMessage() ?? "Servers could not be loaded.")
      serverStatus.set("error")
      return
    }

    // A retained list stays selectable while its revalidation fails; the stale data status reports it.
    configurationErrorMessage.set(isError ? (serverQuery.errorMessage() ?? "Servers could not be loaded.") : null)
    servers.set([...list])
    if (list.length === 0) {
      untrack(() => selectedServerIdSet(null))
      serverStatus.set("empty")
      return
    }
    untrack(() => {
      const current = selectedServerId.get()
      if (current === null || !list.some((server) => server.id === current)) {
        selectedServerIdSet(list[0]?.id ?? null)
      }
    })
    serverStatus.set("ready")
  })

  createEffect(() => {
    const serverId = selectedServerId.get()
    if (serverId === null) {
      agents.set([])
      untrack(() => selectedAgentIdSet(null))
      // Without a usable server the agent list mirrors the server outcome instead of
      // claiming an independent empty state while the servers are loading or failing.
      const serverOutcome = serverStatus.get()
      agentStatus.set(serverOutcome === "loading" || serverOutcome === "error" ? serverOutcome : "empty")
      return
    }

    const list = agentListQuery.data()?.agents
    const isError = agentListQuery.isError()
    if (list === undefined) {
      agents.set([])
      if (!isError) {
        agentStatus.set("loading")
        return
      }
      configurationErrorMessage.set(agentListQuery.errorMessage() ?? "Execution agents could not be loaded.")
      agentStatus.set("error")
      return
    }

    configurationErrorMessage.set(
      isError ? (agentListQuery.errorMessage() ?? "Execution agents could not be loaded.") : null,
    )
    const primaryAgents = list.filter((agent) => agent.parentAgentId === null && agent.role === "primary")
    agents.set(primaryAgents)
    if (primaryAgents.length === 0) {
      untrack(() => selectedAgentIdSet(null))
      agentCreateMode.set(true)
      agentDraft.set(agentDraftEmpty())
      agentStatus.set("empty")
      return
    }
    untrack(() => {
      const current = selectedAgentId.get()
      const saved = savedSelections[serverId]
      if (current === null || !primaryAgents.some((agent) => agent.id === current)) {
        selectedAgentIdSet(
          (saved !== undefined && primaryAgents.some((agent) => agent.id === saved) ? saved : primaryAgents[0]?.id) ??
            null,
        )
      }
      agentCreateMode.set(false)
    })
    agentStatus.set("ready")
  })

  createEffect(() => {
    if (selectedServerId.get() === null || selectedAgentId.get() === null || agentCreateMode.get()) {
      agentDetail.set(null)
      agentDetailStatus.set("idle")
      return
    }

    const detail = agentDetailQuery.data()?.agent
    if (detail === undefined) {
      if (!agentDetailQuery.isError()) {
        agentDetailStatus.set("loading")
        return
      }
      configurationErrorMessage.set(agentDetailQuery.errorMessage() ?? "The selected agent could not be loaded.")
      agentDetailStatus.set("error")
      return
    }

    agentDetail.set(detail)
    const draft = agentDraftFromDetail(detail)
    if (draft !== null) agentDraft.set(draft)
    configurationErrorMessage.set(
      draft === null
        ? "Deterministic agents can be selected, but only Codex-LB and CLIProxyAPI agents can be edited here."
        : null,
    )
    agentDetailStatus.set("ready")
  })

  // The persisted target of an opened session is read through the typed session client and the
  // shared account-scoped revision/ETag cache, so a retained shell restores the selection at once.
  const sessionDetailQuery = httpQueryStateCreate<SessionDetailResponse>({
    cache: accountCache.cache,
    key: () => {
      const sessionId = options.selectedSessionId()
      return sessionId === null ? undefined : accountCache.keyCreate(`/api/sessions/${encodeURIComponent(sessionId)}`)
    },
    load: async (_key, signal) =>
      httpQueryRepresentationResolve(
        await sessionDetailFetch(untrack(() => options.selectedSessionId()) ?? "", {
          fetch: fetchImplementation,
          signal,
        }),
      ),
  })

  createEffect(() => {
    // A failed or pending read leaves the pending selection usable instead of clearing it.
    const detail = sessionDetailQuery.data()
    if (detail === undefined || isDisposed) return
    untrack(() => {
      selectedServerIdSet(detail.session.serverId)
      selectedAgentIdSet(detail.session.primaryAgentId)
    })
  })

  const pendingTarget = () => {
    const result = v.safeParse(agentExecutionTargetSchema, {
      agentId: selectedAgentId.get() ?? "",
      serverId: selectedServerId.get() ?? "",
    })
    return result.success ? result.output : null
  }

  const sessionCreateKeyResolve = (target: { agentId: string; serverId: string }, projectPath: string) =>
    `${target.serverId}/${target.agentId}/${projectPath}`

  const pendingCreateRequestIdResolve = (target: { agentId: string; serverId: string }, projectPath: string) => {
    const key = sessionCreateKeyResolve(target, projectPath)
    if (pendingCreateKey !== key || pendingCreateRequestId === null) {
      pendingCreateKey = key
      pendingCreateRequestId = clientRequestIdCreate()
    }
    return pendingCreateRequestId
  }

  const sessionCreateErrorClear = () => {
    if (sessionCreateStatus.get() === "error") sessionCreateStatus.set("idle")
    sessionCreateErrorMessage.set(undefined)
  }

  const configurationOperationReset = () => {
    configurationErrorMessage.set(null)
    models.set([])
    modelsStatus.set("idle")
    connectionTest.set(null)
    connectionTestStatus.set("idle")
    if (saveStatus.get() !== "saving") saveStatus.set("idle")
  }

  const agentDraftChange = (change: Partial<AgentDraft>) => {
    agentDraft.set({ ...agentDraft.get(), ...change })
    configurationOperationReset()
  }

  const agentSelectionPersist = (agentId: string) => {
    const serverId = selectedServerId.get()
    if (serverId === null) return
    savedSelections[serverId] = agentId
    try {
      storage?.setItem(sessionTargetSelectionStorageKey, JSON.stringify(savedSelections))
    } catch (_error) {
      // The in-memory selection remains useful when browser storage is unavailable.
    }
  }

  const agentConfigurationParse = () => {
    const result = v.safeParse(agentConfigurationSchema, agentDraftConfiguration(agentDraft.get()))
    if (result.success) return result.output
    configurationErrorMessage.set("Enter a valid base URL and model before contacting the provider.")
    return null
  }

  const providerRequestStart = async (operation: "models" | "connection-test") => {
    const serverId = selectedServerId.get()
    const configuration = agentConfigurationParse()
    if (serverId === null || configuration === null || isDisposed) return

    configurationErrorMessage.set(null)
    if (operation === "models") modelsStatus.set("loading")
    if (operation === "connection-test") connectionTestStatus.set("testing")
    const selectedId = agentCreateMode.get() ? null : selectedAgentId.get()
    const agentPath = selectedId === null ? "agents" : `agents/${encodeURIComponent(selectedId)}`
    try {
      const response = await fetchImplementation(
        `/api/servers/${encodeURIComponent(serverId)}/${agentPath}/${operation}`,
        {
          body: JSON.stringify({ configuration }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      )
      const body: unknown = await response.json()
      if (isDisposed) return
      if (operation === "models") {
        const parsed = v.safeParse(providerApiModelsResponseSchema, body)
        if (!response.ok || !parsed.success) {
          configurationErrorMessage.set(apiErrorMessageResolve(body, "Models could not be discovered."))
          modelsStatus.set("error")
          return
        }
        models.set(parsed.output.models)
        modelsStatus.set("success")
        return
      }

      const parsed = v.safeParse(providerApiConnectionTestResponseSchema, body)
      if (!response.ok || !parsed.success) {
        configurationErrorMessage.set(apiErrorMessageResolve(body, "The provider connection test failed."))
        connectionTestStatus.set("error")
        return
      }
      connectionTest.set(parsed.output)
      connectionTestStatus.set(parsed.output.ok ? "success" : "error")
      if (!parsed.output.ok) {
        configurationErrorMessage.set(`The provider is reachable, but model ${parsed.output.model} is unavailable.`)
      }
    } catch (_error) {
      if (isDisposed) return
      configurationErrorMessage.set("The provider request failed. Check the connection and try again.")
      if (operation === "models") modelsStatus.set("error")
      if (operation === "connection-test") connectionTestStatus.set("error")
    }
  }

  const agentSave = async () => {
    const serverId = selectedServerId.get()
    if (serverId === null || saveStatus.get() === "saving" || isDisposed) return
    const draft = agentDraft.get()
    const request = v.safeParse(agentCreateRequestSchema, {
      configuration: agentDraftConfiguration(draft),
      name: draft.name,
      role: draft.role,
    })
    if (!request.success) {
      configurationErrorMessage.set("Complete the name, role, base URL, and model with valid values before saving.")
      saveStatus.set("error")
      return
    }

    const selectedId = agentCreateMode.get() ? null : selectedAgentId.get()
    if (selectedId === null && !agentCreateMode.get()) return
    const path =
      selectedId === null
        ? `/api/servers/${encodeURIComponent(serverId)}/agents`
        : `/api/servers/${encodeURIComponent(serverId)}/agents/${encodeURIComponent(selectedId)}`
    saveStatus.set("saving")
    configurationErrorMessage.set(null)
    try {
      const response = await fetchImplementation(path, {
        body: JSON.stringify(request.output),
        headers: { "content-type": "application/json" },
        method: selectedId === null ? "POST" : "PATCH",
      })
      const body: unknown = await response.json()
      if (isDisposed) return
      const parsed = v.safeParse(agentDetailResponseSchema, body)
      if (!response.ok || !parsed.success) {
        configurationErrorMessage.set(apiErrorMessageResolve(body, "The agent configuration could not be saved."))
        saveStatus.set("error")
        return
      }
      selectedAgentIdSet(parsed.output.agent.id)
      agentDetail.set(parsed.output.agent)
      agentCreateMode.set(false)
      const savedDraft = agentDraftFromDetail(parsed.output.agent)
      if (savedDraft !== null) agentDraft.set(savedDraft)
      saveStatus.set("success")
      agentListQuery.refresh()
      agentDetailQuery.refresh()
    } catch (_error) {
      if (!isDisposed) {
        configurationErrorMessage.set("The agent configuration could not be saved. Check the connection and try again.")
        saveStatus.set("error")
      }
    }
  }

  const targetQueries = [serverQuery, agentListQuery, agentDetailQuery] as const

  const targetRevalidate = () => {
    for (const query of targetQueries) query.refresh()
  }

  /**
   * Retained-data lifecycle of the selector representations. Retained rows stay rendered while a
   * revalidation is in flight (`reconciling`) or failed (`stale`); offline wins over both because
   * no revalidation can settle without a network.
   */
  const dataStatus = (): SessionTargetSelectorDataStatus => {
    if (options.isOnline?.() === false) return "offline"
    const hasRetained = servers.get().length > 0 || agents.get().length > 0
    if (targetQueries.some((query) => query.isError())) return hasRetained ? "stale" : "reconciling"
    if (hasRetained && targetQueries.some((query) => query.isLoading() && query.data() !== undefined))
      return "reconciling"
    if (!hasRetained && targetQueries.some((query) => query.isLoading())) return "reconciling"
    return "ready"
  }

  const configurationReadiness = (): SessionTargetConfigurationView => {
    const currentServerStatus = serverStatus.get()
    const currentAgentStatus = agentStatus.get()
    const status: SessionTargetConfigurationView["status"] =
      currentServerStatus === "loading"
        ? "loading"
        : currentServerStatus === "error"
          ? "server-error"
          : currentServerStatus === "empty"
            ? "no-server"
            : currentAgentStatus === "loading" || (!agentCreateMode.get() && agentDetailStatus.get() === "loading")
              ? "loading"
              : currentAgentStatus === "error" || agentDetailStatus.get() === "error"
                ? "agent-error"
                : currentAgentStatus === "empty"
                  ? "no-agent"
                  : "ready"
    const retry = () => {
      if (serverStatus.get() === "error" || serverStatus.get() === "empty") {
        serverQuery.retry()
        return
      }
      if (agentStatus.get() === "error" || agentStatus.get() === "empty") {
        agentListQuery.retry()
        return
      }
      if (agentDetailStatus.get() === "error") agentDetailQuery.retry()
    }

    return {
      agents: agents.get(),
      agentCreateBegin: () => {
        if (selectedServerId.get() === null) return
        agentCreateMode.set(true)
        agentDraft.set(agentDraftEmpty())
        configurationOperationReset()
      },
      agentSelect: (agentId: string) => {
        if (!agents.get().some((agent) => agent.id === agentId)) return
        agentCreateMode.set(false)
        selectedAgentIdSet(agentId)
        agentSelectionPersist(agentId)
        configurationOperationReset()
        sessionCreateErrorClear()
      },
      connectionTest: connectionTest.get(),
      connectionTestStart: () => providerRequestStart("connection-test"),
      connectionTestStatus: connectionTestStatus.get(),
      draft: agentDraft.get(),
      draftBaseUrlChange: (baseUrl: string) => agentDraftChange({ baseUrl }),
      draftModelChange: (model: string) => agentDraftChange({ model }),
      draftNameChange: (name: string) => agentDraftChange({ name }),
      draftProviderChange: (provider: ConfigurableProvider) => {
        agentDraftChange({
          provider,
          secretReference: provider === "codex-lb" ? "$CODEX_LB_API_TOKEN" : "$CLIPROXYAPI_API_KEY",
        })
      },
      draftRoleChange: (role: string) => agentDraftChange({ role }),
      errorMessage: configurationErrorMessage.get(),
      isConfigurableAgent:
        agentCreateMode.get() ||
        agentDetail.get()?.configuration.provider === "cliproxyapi" ||
        agentDetail.get()?.configuration.provider === "codex-lb",
      isCreatingAgent: agentCreateMode.get(),
      models: models.get(),
      modelsDiscover: () => providerRequestStart("models"),
      modelsStatus: modelsStatus.get(),
      retry,
      save: agentSave,
      saveStatus: saveStatus.get(),
      selectedAgentId: selectedAgentId.get(),
      selectedServerId: selectedServerId.get(),
      serverSelect: (serverId: string) => {
        if (!servers.get().some((server) => server.id === serverId)) return
        selectedServerIdSet(serverId)
        configurationOperationReset()
        sessionCreateErrorClear()
      },
      servers: servers.get(),
      sessionCreateStart,
      sessionCreateErrorMessage: sessionCreateErrorMessage.get() ?? null,
      sessionCreateStatus: sessionCreateStatus.get(),
      status,
    }
  }

  const sessionCreateStart = (projectPathOverride?: string): Promise<string | null> => {
    const target = pendingTarget()
    const projectPath = projectPathOverride ?? activeProjectPath()
    if (target === null || isDisposed) return Promise.resolve(null)
    if (projectPath === null) {
      sessionCreateErrorMessage.set("Select a project before creating a conversation.")
      sessionCreateStatus.set("error")
      return Promise.resolve(null)
    }

    const key = sessionCreateKeyResolve(target, projectPath)
    const generation = sessionCreateGeneration
    const existing = sessionCreateInFlight
    if (existing?.key === key && existing.generation === generation) return existing.promise

    const clientRequestId = pendingCreateRequestIdResolve(target, projectPath)
    const requiresNewSessionRoute =
      options.isNewSessionRoute !== undefined && (options.isNewSessionRoute() || options.sessionNew !== undefined)
    sessionCreateStatus.set("creating")
    options.sessionNew?.()
    const sessionCreateIsCurrent = () => {
      const currentTarget = pendingTarget()
      return (
        !isDisposed &&
        sessionCreateGeneration === generation &&
        options.selectedSessionId() === null &&
        currentTarget?.agentId === target.agentId &&
        currentTarget.serverId === target.serverId &&
        (projectPathOverride ?? activeProjectPath()) === projectPath &&
        (!requiresNewSessionRoute || options.isNewSessionRoute?.() === true)
      )
    }
    const task = (async () => {
      try {
        const response = await fetchImplementation("/api/sessions", {
          body: JSON.stringify({
            clientRequestId,
            primaryAgentId: target.agentId,
            projectPath,
            serverId: target.serverId,
            title: "New session",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
        const body: unknown = await response.json()
        if (!sessionCreateIsCurrent()) return null
        const parsed = v.safeParse(sessionTargetCreateResponseSchema, body)
        if (!response.ok || !parsed.success) {
          sessionCreateErrorMessage.set(
            apiErrorMessageResolve(
              body,
              "The conversation could not be created. Check the selected agent and try again.",
            ),
          )
          sessionCreateStatus.set("error")
          return null
        }
        pendingCreateKey = null
        pendingCreateRequestId = null
        sessionCreateErrorMessage.set(undefined)
        sessionCreateStatus.set("idle")
        options.sessionSelect(parsed.output.session.id)
        return parsed.output.session.id
      } catch (_error) {
        if (sessionCreateIsCurrent()) {
          sessionCreateErrorMessage.set("The conversation could not be created. Check the connection and try again.")
          sessionCreateStatus.set("error")
        }
        return null
      }
    })()
    sessionCreateInFlight = { generation, key, promise: task }
    void task.finally(() => {
      if (sessionCreateInFlight?.promise !== task) return
      sessionCreateInFlight = null
      if (!isDisposed && sessionCreateStatus.get() === "creating") sessionCreateStatus.set("idle")
    })
    return task
  }

  createEffect(() => {
    const isNewRoute = options.isNewSessionRoute?.() ?? false
    if (automaticRouteIsNew !== undefined && automaticRouteIsNew !== isNewRoute) automaticCreateKey = null
    automaticRouteIsNew = isNewRoute
    const target = pendingTarget()
    const projectPath = activeProjectPath()
    if (
      !isNewRoute ||
      options.selectedSessionId() !== null ||
      target === null ||
      projectPath === null ||
      sessionCreateStatus.get() === "error"
    )
      return
    const key = sessionCreateKeyResolve(target, projectPath)
    if (automaticCreateKey === key) return
    automaticCreateKey = key
    void sessionCreateStart()
  })

  return {
    agents: agents.get,
    agentSelect: (agentId: string) => {
      if (!agents.get().some((agent) => agent.id === agentId)) return
      agentCreateMode.set(false)
      selectedAgentIdSet(agentId)
      agentSelectionPersist(agentId)
      configurationOperationReset()
      sessionCreateErrorClear()
    },
    agentsReload: () => {
      agentListQuery.refresh()
    },
    agentStatus: agentStatus.get,
    dataStatus,
    canCreateSession: () =>
      pendingTarget() !== null && activeProjectPath() !== null && sessionCreateStatus.get() !== "creating",
    configurationReadiness,
    isCreatingSession: () => sessionCreateStatus.get() === "creating",
    pendingTarget,
    selectedAgentId: selectedAgentId.get,
    selectedAgentName: () =>
      agents.get().find((agent) => agent.id === selectedAgentId.get())?.name ?? "Local execution agent",
    selectedServerId: selectedServerId.get,
    servers: servers.get,
    serverSelect: (serverId: string) => {
      if (!servers.get().some((server) => server.id === serverId)) return
      selectedServerIdSet(serverId)
      configurationOperationReset()
      sessionCreateErrorClear()
    },
    serversReload: () => {
      serverQuery.refresh()
    },
    serverStatus: serverStatus.get,
    targetRevalidate,
    sessionCreateStart,
    sessionCreateErrorMessage: sessionCreateErrorMessage.get,
    sessionCreateStatus: sessionCreateStatus.get,
  }
}

export type SessionTargetSelectorState = ReturnType<typeof sessionTargetSelectorStateCreate>
