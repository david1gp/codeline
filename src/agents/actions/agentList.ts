import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function agentList(
  client: ServerAgentConvexClient,
  organizationId: string,
  serverId: string,
  search?: string,
): ReturnType<ServerAgentConvexClient["agentList"]> {
  return client.agentList(organizationId, serverId, search)
}
