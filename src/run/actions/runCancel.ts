import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryCancel } from "../db/runRepositoryCancel.js"

export function runCancel(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: Parameters<typeof runRepositoryCancel>[4] = {},
  options: Parameters<typeof runRepositoryCancel>[5] = {},
): ReturnType<typeof runRepositoryCancel> {
  return runRepositoryCancel(database, userId, sessionId, runId, input, options)
}
