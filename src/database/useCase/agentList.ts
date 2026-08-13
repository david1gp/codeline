import type { DatabaseExecutor } from "../databaseClient.js"
import { agentRepositoryList } from "../repository/agentRepositoryList.js"

export function agentList(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  search?: string,
): ReturnType<typeof agentRepositoryList> {
  return agentRepositoryList(database, userId, serverId, search)
}
