import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryLoad } from "../db/runRepositoryLoad.js"

export function runLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  clientRunId: string,
): ReturnType<typeof runRepositoryLoad> {
  return runRepositoryLoad(database, userId, sessionId, clientRunId)
}
