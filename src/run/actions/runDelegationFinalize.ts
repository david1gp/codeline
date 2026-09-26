import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryDelegationFinalize } from "../db/runRepositoryDelegationFinalize.js"

export function runDelegationFinalize(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  delegationId: string,
  input: Parameters<typeof runRepositoryDelegationFinalize>[4],
  options: Parameters<typeof runRepositoryDelegationFinalize>[5] = {},
): ReturnType<typeof runRepositoryDelegationFinalize> {
  return runRepositoryDelegationFinalize(database, userId, sessionId, delegationId, input, options)
}
