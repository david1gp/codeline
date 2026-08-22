import type { ServerAgentConvexClient } from "../../convex/serverAgentConvexClient.js"

export function serverList(
  client: ServerAgentConvexClient,
  organizationId: string,
  search?: string,
): ReturnType<ServerAgentConvexClient["serverList"]> {
  return client.serverList(organizationId, search)
}
