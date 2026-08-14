import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryTransition } from "../db/runRepositoryTransition.js"

export function runTransition(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: Parameters<typeof runRepositoryTransition>[4],
): ReturnType<typeof runRepositoryTransition> {
  return runRepositoryTransition(database, userId, sessionId, runId, input)
}
