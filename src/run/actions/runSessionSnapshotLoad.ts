import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositorySessionSnapshotLoad } from "../db/runRepositorySessionSnapshotLoad.js"

export function runSessionSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof runRepositorySessionSnapshotLoad> {
  return runRepositorySessionSnapshotLoad(database, userId, organizationId, sessionId)
}
