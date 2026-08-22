import type { AgentConfiguration } from "../schema/agentConfigurationSchema.js"
import type { AgentRecord } from "./agentRecord.js"

type AgentDocument = Omit<AgentRecord, "configuration"> & {
  _creationTime?: number
  _id?: string
  configuration: unknown
}

export function agentDocumentPublic(document: AgentDocument): AgentRecord {
  return {
    configuration: document.configuration as AgentConfiguration,
    createdAt: document.createdAt,
    id: document.id,
    name: document.name,
    ...(document.parentAgentId === undefined ? {} : { parentAgentId: document.parentAgentId }),
    role: document.role,
    serverId: document.serverId,
    sortOrder: document.sortOrder,
    updatedAt: document.updatedAt,
  }
}
