import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositoryActiveSnapshotLoad } from "../db/runRepositoryActiveSnapshotLoad.js"

export function runActiveSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
  dependencies: Parameters<typeof runRepositoryActiveSnapshotLoad>[5] = {},
): ReturnType<typeof runRepositoryActiveSnapshotLoad> {
  return runRepositoryActiveSnapshotLoad(database, userId, organizationId, sessionId, runId, dependencies)
}
