import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryList } from "../db/agentRepositoryList.js"

export function agentList(
  database: DatabaseExecutor,
  organizationId: string,
  serverId: string,
  search?: string,
): ReturnType<typeof agentRepositoryList> {
  return agentRepositoryList(database, organizationId, serverId, search)
}
