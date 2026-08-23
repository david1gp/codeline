import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositorySessionStreamSnapshotLoad } from "../db/runRepositorySessionStreamSnapshotLoad.js"

export function runSessionStreamSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof runRepositorySessionStreamSnapshotLoad> {
  return runRepositorySessionStreamSnapshotLoad(database, userId, organizationId, sessionId)
}
