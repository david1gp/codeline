import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryCreate } from "../db/agentRepositoryCreate.js"

export function agentCreate(
  database: DatabaseExecutor,
  organizationId: string,
  serverId: string,
  input: unknown,
): ReturnType<typeof agentRepositoryCreate> {
  return agentRepositoryCreate(database, organizationId, serverId, input)
}
