import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function agentLoad(
  client: ServerAgentConvexClient,
  organizationId: string,
  serverId: string,
  agentId: string,
): ReturnType<ServerAgentConvexClient["agentLoad"]> {
  return client.agentLoad(organizationId, serverId, agentId)
}
