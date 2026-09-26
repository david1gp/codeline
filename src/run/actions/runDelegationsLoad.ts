import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryDelegationsLoad } from "../db/runRepositoryDelegationsLoad.js"

export function runDelegationsLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof runRepositoryDelegationsLoad> {
  return runRepositoryDelegationsLoad(database, userId, organizationId, sessionId)
}
