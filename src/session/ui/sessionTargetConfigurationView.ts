import type { AgentListResponse } from "../../agents/api/agentListResponseSchema.js"
import type { ProviderApiConnectionTestResponse } from "../../providers/api/providerApiConnectionTestResponseSchema.js"
import type { ProviderApiModelsResponse } from "../../providers/api/providerApiModelsResponseSchema.js"
import type { ServerListResponse } from "../../servers/api/serverListResponseSchema.js"
import type { SessionProjectTarget } from "./sessionProjectTarget.js"

type SessionTargetConfigurationAgent = AgentListResponse["agents"][number]
type SessionTargetConfigurationServer = ServerListResponse["servers"][number]

type SessionTargetConfigurationDraft = {
  baseUrl: string
  model: string
  name: string
  provider: "cliproxyapi" | "multisub"
  role: string
  secretReference: "$CLIPROXYAPI_API_KEY" | "$MULTISUB_API_KEY"
}

/** Workspace setup contract for selecting, configuring, testing, and starting an execution target. */
export type SessionTargetConfigurationView = {
  agents: ReadonlyArray<SessionTargetConfigurationAgent>
  agentCreateBegin: () => void
  agentSelect: (agentId: string) => void
  connectionTest: ProviderApiConnectionTestResponse | null
  connectionTestStart: () => Promise<void>
  connectionTestStatus: "idle" | "testing" | "success" | "error"
  draft: SessionTargetConfigurationDraft
  draftBaseUrlChange: (value: string) => void
  draftModelChange: (value: string) => void
  draftNameChange: (value: string) => void
  draftProviderChange: (value: "cliproxyapi" | "multisub") => void
  draftRoleChange: (value: string) => void
  errorMessage: string | null
  isConfigurableAgent: boolean
  isCreatingAgent: boolean
  models: ProviderApiModelsResponse["models"]
  modelsDiscover: () => Promise<void>
  modelsStatus: "idle" | "loading" | "success" | "error"
  retry: () => void
  save: () => Promise<void>
  saveStatus: "idle" | "saving" | "success" | "error"
  selectedAgentId: string | null
  selectedServerId: string | null
  serverSelect: (serverId: string) => void
  servers: ReadonlyArray<SessionTargetConfigurationServer>
  sessionCreateStart: (projectTarget?: SessionProjectTarget) => Promise<string | null>
  sessionCreateErrorMessage: string | null
  sessionCreateStatus: "idle" | "creating" | "error"
  status: "loading" | "no-server" | "server-error" | "no-agent" | "agent-error" | "ready"
}
