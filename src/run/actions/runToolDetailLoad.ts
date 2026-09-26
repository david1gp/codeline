import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositoryToolDetailLoad } from "../db/runRepositoryToolDetailLoad.js"

export function runToolDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
  detailId: string,
): ReturnType<typeof runRepositoryToolDetailLoad> {
  return runRepositoryToolDetailLoad(database, userId, organizationId, sessionId, runId, detailId)
}
