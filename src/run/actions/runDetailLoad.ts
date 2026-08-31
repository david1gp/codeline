import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositoryDetailLoad } from "../db/runRepositoryDetailLoad.js"

export function runDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
): ReturnType<typeof runRepositoryDetailLoad> {
  return runRepositoryDetailLoad(database, userId, organizationId, sessionId, runId)
}
