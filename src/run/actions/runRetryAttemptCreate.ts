import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryRetryAttemptCreate } from "../db/runRepositoryRetryAttemptCreate.js"

export function runRetryAttemptCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
): ReturnType<typeof runRepositoryRetryAttemptCreate> {
  return runRepositoryRetryAttemptCreate(database, userId, sessionId, runId)
}
