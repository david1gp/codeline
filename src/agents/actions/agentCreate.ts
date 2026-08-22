import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function agentCreate(
  client: ServerAgentConvexClient,
  organizationId: string,
  serverId: string,
  input: unknown,
): ReturnType<ServerAgentConvexClient["agentCreate"]> {
  return client.agentCreate(organizationId, serverId, input as { configuration: unknown; name: string; role: string })
}
