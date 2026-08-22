import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function agentUpdate(
  client: ServerAgentConvexClient,
  organizationId: string,
  serverId: string,
  agentId: string,
  input: unknown,
): ReturnType<ServerAgentConvexClient["agentUpdate"]> {
  return client.agentUpdate(
    organizationId,
    serverId,
    agentId,
    input as {
      configuration?: unknown
      name?: string
      role?: string
    },
  )
}
