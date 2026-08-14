import type { Accessor } from "solid-js"
import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { agentListResponseSchema } from "../agents/api/agentListResponseSchema.js"
import { agentExecutionTargetSchema } from "../agents/schema/agentExecutionTargetSchema.js"
import { serverListResponseSchema } from "../servers/api/serverListResponseSchema.js"
import { sessionTargetCreateResponseSchema } from "../session/api/sessionTargetCreateResponseSchema.js"
import { sessionTargetLoadResponseSchema } from "../session/api/sessionTargetLoadResponseSchema.js"

type SessionTargetSelectorStatus = "loading" | "ready" | "empty" | "error"
type SessionTargetSelectorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type SessionTargetServer = v.InferOutput<typeof serverListResponseSchema>["servers"][number]
type SessionTargetAgent = v.InferOutput<typeof agentListResponseSchema>["agents"][number]

type SessionTargetSelectorStateOptions = {
  clientRequestIdCreate?: () => string
  fetch?: SessionTargetSelectorFetch
  selectedSessionId: Accessor<string | null>
  sessionSelect: (sessionId: string) => void
}

function sessionTargetSignalObjectCreate<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function sessionTargetSelectorStateCreate(options: SessionTargetSelectorStateOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const clientRequestIdCreate = options.clientRequestIdCreate ?? (() => crypto.randomUUID())
  const servers = sessionTargetSignalObjectCreate<SessionTargetServer[]>([])
  const agents = sessionTargetSignalObjectCreate<SessionTargetAgent[]>([])
  const serverStatus = sessionTargetSignalObjectCreate<SessionTargetSelectorStatus>("loading")
  const agentStatus = sessionTargetSignalObjectCreate<SessionTargetSelectorStatus>("loading")
  const selectedServerId = sessionTargetSignalObjectCreate<string | null>(null)
  const selectedAgentId = sessionTargetSignalObjectCreate<string | null>(null)
  const sessionCreateStatus = sessionTargetSignalObjectCreate<"idle" | "creating" | "error">("idle")
  const serverReloadToken = sessionTargetSignalObjectCreate(0)
  const agentReloadToken = sessionTargetSignalObjectCreate(0)

  // The pending create intent keeps one client request id so that a retry after an ambiguous
  // failure stays idempotent on the server until the create succeeds or the target changes.
  let pendingCreateKey: string | null = null
  let pendingCreateRequestId: string | null = null
  let isDisposed = false
  onCleanup(() => {
    isDisposed = true
  })

  createEffect(() => {
    serverReloadToken.get()
    const controller = new AbortController()
    serverStatus.set("loading")
    void (async () => {
      try {
        const response = await fetchImplementation("/api/servers", { signal: controller.signal })
        const body: unknown = await response.json()
        if (controller.signal.aborted || isDisposed) return
        const parsed = v.safeParse(serverListResponseSchema, body)
        if (!response.ok || !parsed.success) {
          serverStatus.set("error")
          return
        }
        servers.set(parsed.output.servers)
        if (parsed.output.servers.length === 0) {
          selectedServerId.set(null)
          serverStatus.set("empty")
          return
        }
        const current = selectedServerId.get()
        if (current === null || !parsed.output.servers.some((server) => server.id === current)) {
          selectedServerId.set(parsed.output.servers[0]?.id ?? null)
        }
        serverStatus.set("ready")
      } catch (_error) {
        if (!controller.signal.aborted && !isDisposed) serverStatus.set("error")
      }
    })()
    onCleanup(() => controller.abort())
  })

  createEffect(() => {
    agentReloadToken.get()
    const serverId = selectedServerId.get()
    agents.set([])
    if (serverId === null) {
      selectedAgentId.set(null)
      // Without a usable server the agent list mirrors the server outcome instead of
      // claiming an independent empty state while the servers are loading or failing.
      const serverOutcome = serverStatus.get()
      agentStatus.set(serverOutcome === "loading" || serverOutcome === "error" ? serverOutcome : "empty")
      return
    }

    const controller = new AbortController()
    agentStatus.set("loading")
    void (async () => {
      try {
        const response = await fetchImplementation(`/api/servers/${encodeURIComponent(serverId)}/agents`, {
          signal: controller.signal,
        })
        const body: unknown = await response.json()
        if (controller.signal.aborted || isDisposed) return
        const parsed = v.safeParse(agentListResponseSchema, body)
        if (!response.ok || !parsed.success) {
          agentStatus.set("error")
          return
        }
        agents.set(parsed.output.agents)
        if (parsed.output.agents.length === 0) {
          selectedAgentId.set(null)
          agentStatus.set("empty")
          return
        }
        const current = selectedAgentId.get()
        if (current === null || !parsed.output.agents.some((agent) => agent.id === current)) {
          selectedAgentId.set(parsed.output.agents[0]?.id ?? null)
        }
        agentStatus.set("ready")
      } catch (_error) {
        if (!controller.signal.aborted && !isDisposed) agentStatus.set("error")
      }
    })()
    onCleanup(() => controller.abort())
  })

  createEffect(() => {
    const sessionId = options.selectedSessionId()
    if (sessionId === null) return

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetchImplementation(`/api/sessions/${encodeURIComponent(sessionId)}`, {
          signal: controller.signal,
        })
        const body: unknown = await response.json()
        if (controller.signal.aborted || isDisposed) return
        const parsed = v.safeParse(sessionTargetLoadResponseSchema, body)
        if (!response.ok || !parsed.success) return
        selectedServerId.set(parsed.output.session.serverId)
        selectedAgentId.set(parsed.output.session.primaryAgentId)
      } catch (_error) {
        // The pending selection stays usable when the persisted target cannot be loaded.
      }
    })()
    onCleanup(() => controller.abort())
  })

  const pendingTarget = () => {
    const result = v.safeParse(agentExecutionTargetSchema, {
      agentId: selectedAgentId.get() ?? "",
      serverId: selectedServerId.get() ?? "",
    })
    return result.success ? result.output : null
  }

  const pendingCreateRequestIdResolve = (target: { agentId: string; serverId: string }) => {
    const key = `${target.serverId}/${target.agentId}`
    if (pendingCreateKey !== key || pendingCreateRequestId === null) {
      pendingCreateKey = key
      pendingCreateRequestId = clientRequestIdCreate()
    }
    return pendingCreateRequestId
  }

  const sessionCreateErrorClear = () => {
    if (sessionCreateStatus.get() === "error") sessionCreateStatus.set("idle")
  }

  const sessionCreateStart = async () => {
    const target = pendingTarget()
    if (target === null || sessionCreateStatus.get() === "creating" || isDisposed) return

    const clientRequestId = pendingCreateRequestIdResolve(target)
    sessionCreateStatus.set("creating")
    try {
      const response = await fetchImplementation("/api/sessions", {
        body: JSON.stringify({
          clientRequestId,
          primaryAgentId: target.agentId,
          serverId: target.serverId,
          title: "New session",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
      const body: unknown = await response.json()
      if (isDisposed) return
      const parsed = v.safeParse(sessionTargetCreateResponseSchema, body)
      if (!response.ok || !parsed.success) {
        sessionCreateStatus.set("error")
        return
      }
      pendingCreateKey = null
      pendingCreateRequestId = null
      sessionCreateStatus.set("idle")
      options.sessionSelect(parsed.output.session.id)
    } catch (_error) {
      if (!isDisposed) sessionCreateStatus.set("error")
    }
  }

  return {
    agents: agents.get,
    agentSelect: (agentId: string) => {
      if (!agents.get().some((agent) => agent.id === agentId)) return
      selectedAgentId.set(agentId)
      sessionCreateErrorClear()
    },
    agentsReload: () => {
      agentReloadToken.set(agentReloadToken.get() + 1)
    },
    agentStatus: agentStatus.get,
    canCreateSession: () => pendingTarget() !== null && sessionCreateStatus.get() !== "creating",
    isCreatingSession: () => sessionCreateStatus.get() === "creating",
    pendingTarget,
    selectedAgentId: selectedAgentId.get,
    selectedServerId: selectedServerId.get,
    servers: servers.get,
    serverSelect: (serverId: string) => {
      if (!servers.get().some((server) => server.id === serverId)) return
      selectedServerId.set(serverId)
      sessionCreateErrorClear()
    },
    serversReload: () => {
      serverReloadToken.set(serverReloadToken.get() + 1)
    },
    serverStatus: serverStatus.get,
    sessionCreateStart,
    sessionCreateStatus: sessionCreateStatus.get,
  }
}

export type SessionTargetSelectorState = ReturnType<typeof sessionTargetSelectorStateCreate>
