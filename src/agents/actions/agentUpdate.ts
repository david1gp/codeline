import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryUpdate } from "../db/agentRepositoryUpdate.js"

export function agentUpdate(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  agentId: string,
  input: unknown,
): ReturnType<typeof agentRepositoryUpdate> {
  return agentRepositoryUpdate(database, userId, serverId, agentId, input)
}
