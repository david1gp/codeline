import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryLoad } from "../db/agentRepositoryLoad.js"

export function agentLoad(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  agentId: string,
): ReturnType<typeof agentRepositoryLoad> {
  return agentRepositoryLoad(database, userId, serverId, agentId)
}
