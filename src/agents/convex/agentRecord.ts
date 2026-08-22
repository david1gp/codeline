import type { AgentConfiguration } from "../schema/agentConfigurationSchema.js"

export type AgentRecord = {
  configuration: AgentConfiguration
  createdAt: number
  id: string
  name: string
  parentAgentId?: string
  role: string
  serverId: string
  sortOrder: number
  updatedAt: number
}
