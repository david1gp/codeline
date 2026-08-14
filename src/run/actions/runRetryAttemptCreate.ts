import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryRetryAttemptCreate } from "../db/runRepositoryRetryAttemptCreate.js"

export function runRetryAttemptCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  options: Parameters<typeof runRepositoryRetryAttemptCreate>[4] = {},
): ReturnType<typeof runRepositoryRetryAttemptCreate> {
  return runRepositoryRetryAttemptCreate(database, userId, sessionId, runId, options)
}
