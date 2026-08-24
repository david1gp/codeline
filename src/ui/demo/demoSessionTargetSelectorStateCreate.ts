import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { SessionTargetSelectorState } from "../sessionTargetSelectorStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoServers = [
  { id: "demo-server-local", name: "Local workstation" },
  { id: "demo-server-sandbox", name: "Sandbox runner" },
]
const demoAgents = [
  { id: "demo-agent-builder", name: "Builder", parentAgentId: null, role: "primary", serverId: "demo-server-local" },
  {
    id: "demo-agent-reviewer",
    name: "Reviewer",
    parentAgentId: null,
    role: "reviewer",
    serverId: "demo-server-local",
  },
]

export function demoSessionTargetSelectorStateCreate(
  variant: () => DemoSessionScreenVariant,
): SessionTargetSelectorState {
  const selectedServerId = createSignalObject<string | null>(demoServers[0]?.id ?? null)
  const selectedAgentId = createSignalObject<string | null>(demoAgents[0]?.id ?? null)
  const status = () => {
    if (variant() === "loading") return "loading" as const
    if (variant() === "error") return "error" as const
    if (variant() === "empty") return "empty" as const
    return "ready" as const
  }
  const servers = () => (status() === "ready" ? demoServers : [])
  const agents = () => (status() === "ready" ? demoAgents : [])
  const agentSelect = (agentId: string) => {
    if (agents().some((agent) => agent.id === agentId)) selectedAgentId.set(agentId)
  }
  const retry = () => undefined

  const configurationReadiness = () => {
    const currentStatus = status()
    const currentAgentId = selectedAgentId.get() ?? ""
    return {
      agents: agents(),
      agentCreateBegin: () => undefined,
      agentSelect,
      connectionTest: null,
      connectionTestStart: () => Promise.resolve(),
      connectionTestStatus: "idle" as const,
      draft: {
        baseUrl: "https://gateway.example.com/v1",
        model: "demo-model",
        name: "Builder",
        provider: "codex-lb" as const,
        role: "primary",
        secretReference: "$CODEX_LB_API_TOKEN" as const,
      },
      draftBaseUrlChange: () => undefined,
      draftModelChange: () => undefined,
      draftNameChange: () => undefined,
      draftProviderChange: () => undefined,
      draftRoleChange: () => undefined,
      errorMessage: currentStatus === "error" ? "The demo agents could not be loaded." : null,
      isConfigurableAgent: currentStatus === "ready",
      isCreatingAgent: false,
      models: [],
      modelsDiscover: () => Promise.resolve(),
      modelsStatus: "idle" as const,
      retry,
      save: () => Promise.resolve(),
      saveStatus: "idle" as const,
      selectedAgentId: currentStatus === "ready" ? currentAgentId : null,
      selectedServerId: currentStatus === "ready" ? selectedServerId.get() : null,
      serverSelect: () => undefined,
      servers: servers(),
      sessionCreateStart: () => Promise.resolve(null),
      sessionCreateErrorMessage: currentStatus === "error" ? "The demo conversation could not be created." : null,
      sessionCreateStatus: "idle" as const,
      status:
        currentStatus === "error"
          ? ("server-error" as const)
          : currentStatus === "empty"
            ? ("no-server" as const)
            : currentStatus,
    }
  }

  return {
    agents,
    agentSelect,
    agentsReload: () => undefined,
    agentStatus: status,
    dataStatus: () => (status() === "loading" ? ("reconciling" as const) : ("ready" as const)),
    canCreateSession: () => status() === "ready",
    configurationReadiness,
    isCreatingSession: () => false,
    pendingTarget: () => {
      const agentId = selectedAgentId.get()
      const serverId = selectedServerId.get()
      return agentId === null || serverId === null || status() !== "ready" ? null : { agentId, serverId }
    },
    selectedAgentId: selectedAgentId.get,
    selectedAgentName: () =>
      agents().find((agent) => agent.id === selectedAgentId.get())?.name ?? "Local execution agent",
    selectedServerId: selectedServerId.get,
    servers,
    serverSelect: (serverId: string) => {
      if (servers().some((server) => server.id === serverId)) selectedServerId.set(serverId)
    },
    serversReload: () => undefined,
    serverStatus: status,
    targetRevalidate: () => undefined,
    sessionCreateErrorMessage: () =>
      variant() === "error" ? "The demo conversation could not be created." : undefined,
    sessionCreateStart: () => Promise.resolve(null),
    sessionCreateStatus: () => (variant() === "error" ? "error" : "idle"),
  }
}
