import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function serverLoad(
  client: ServerAgentConvexClient,
  organizationId: string,
  serverId: string,
): ReturnType<ServerAgentConvexClient["serverLoad"]> {
  return client.serverLoad(organizationId, serverId)
}
