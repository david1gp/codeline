import type { Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { SessionSettledSnapshotResponse } from "../api/sessionSettledSnapshotResponseSchema.js"
import { sessionRepositorySettledSnapshot } from "../db/sessionRepositorySettledSnapshot.js"

type SessionSettledSnapshotDependencies = Parameters<typeof sessionRepositorySettledSnapshot>[4]

export function sessionSettledSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionSettledSnapshotDependencies,
): Promise<Result<SessionSettledSnapshotResponse>> {
  return sessionRepositorySettledSnapshot(database, userId, organizationId, sessionId, dependencies)
}
