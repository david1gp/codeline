import type { Result } from "@adaptive-ds/result"
import type { AgentListRow } from "../agents/convex/agentList.js"
import type { AgentLoadResult } from "../agents/convex/agentLoad.js"
import type { AgentRecord } from "../agents/convex/agentRecord.js"
import type { ServerRecord } from "../servers/convex/serverRecord.js"

export type ServerAgentConvexClient = {
  agentCreate: (
    organizationId: string,
    serverId: string,
    input: { configuration: unknown; name: string; role: string },
  ) => Promise<Result<AgentRecord>>
  agentList: (organizationId: string, serverId: string, search?: string) => Promise<Result<AgentListRow[]>>
  agentLoad: (organizationId: string, serverId: string, agentId: string) => Promise<Result<AgentLoadResult>>
  agentUpdate: (
    organizationId: string,
    serverId: string,
    agentId: string,
    input: { configuration?: unknown; name?: string; role?: string },
  ) => Promise<Result<AgentRecord>>
  serverList: (organizationId: string, search?: string) => Promise<Result<ServerRecord[]>>
  serverLoad: (organizationId: string, serverId: string) => Promise<Result<ServerRecord>>
}
