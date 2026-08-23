import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryLoad } from "../db/agentRepositoryLoad.js"

export function agentLoad(
  database: DatabaseExecutor,
  organizationId: string,
  serverId: string,
  agentId: string,
): ReturnType<typeof agentRepositoryLoad> {
  return agentRepositoryLoad(database, organizationId, serverId, agentId)
}
