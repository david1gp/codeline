import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryCreate } from "../db/agentRepositoryCreate.js"

export function agentCreate(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  input: unknown,
): ReturnType<typeof agentRepositoryCreate> {
  return agentRepositoryCreate(database, userId, serverId, input)
}
