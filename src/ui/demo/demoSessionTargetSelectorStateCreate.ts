import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { SessionTargetSelectorState } from "../sessionTargetSelectorStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoServers = [
  { id: "demo-server-local", name: "Local workstation" },
  { id: "demo-server-sandbox", name: "Sandbox runner" },
]
const demoAgents = [
  { id: "demo-agent-builder", name: "Builder", role: "primary", serverId: "demo-server-local" },
  { id: "demo-agent-reviewer", name: "Reviewer", role: "reviewer", serverId: "demo-server-local" },
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

  return {
    agents,
    agentSelect: (agentId: string) => {
      if (agents().some((agent) => agent.id === agentId)) selectedAgentId.set(agentId)
    },
    agentsReload: () => undefined,
    agentStatus: status,
    canCreateSession: () => status() === "ready",
    isCreatingSession: () => false,
    pendingTarget: () => {
      const agentId = selectedAgentId.get()
      const serverId = selectedServerId.get()
      return agentId === null || serverId === null || status() !== "ready" ? null : { agentId, serverId }
    },
    selectedAgentId: selectedAgentId.get,
    selectedServerId: selectedServerId.get,
    servers,
    serverSelect: (serverId: string) => {
      if (servers().some((server) => server.id === serverId)) selectedServerId.set(serverId)
    },
    serversReload: () => undefined,
    serverStatus: status,
    sessionCreateStart: () => Promise.resolve(),
    sessionCreateStatus: () => (variant() === "error" ? "error" : "idle"),
  }
}
