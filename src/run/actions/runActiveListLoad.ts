import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositoryActiveListLoad } from "../db/runRepositoryActiveListLoad.js"

export function runActiveListLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof runRepositoryActiveListLoad> {
  return runRepositoryActiveListLoad(database, userId, organizationId, sessionId)
}
