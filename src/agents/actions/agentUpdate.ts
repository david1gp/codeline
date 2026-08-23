import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentRepositoryUpdate } from "../db/agentRepositoryUpdate.js"

export function agentUpdate(
  database: DatabaseExecutor,
  organizationId: string,
  serverId: string,
  agentId: string,
  input: unknown,
): ReturnType<typeof agentRepositoryUpdate> {
  return agentRepositoryUpdate(database, organizationId, serverId, agentId, input)
}
