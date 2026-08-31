import type { Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionRepositoryBoundedSnapshot } from "../db/sessionRepositoryBoundedSnapshot.js"

type SessionBoundedSnapshotDependencies = Parameters<typeof sessionRepositoryBoundedSnapshot>[4]

export function sessionBoundedSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionBoundedSnapshotDependencies,
): Promise<Result<SessionBoundedSnapshot>> {
  return sessionRepositoryBoundedSnapshot(database, userId, organizationId, sessionId, dependencies)
}
