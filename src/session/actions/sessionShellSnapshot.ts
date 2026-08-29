import { createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { sessionDetailResponseCreate } from "../api/sessionDetailResponseCreate.js"
import type { SessionDetailResponse } from "../api/sessionDetailResponseSchema.js"
import { sessionRepositoryShellSnapshot } from "../db/sessionRepositoryShellSnapshot.js"

type SessionShellSnapshotDependencies = Parameters<typeof sessionRepositoryShellSnapshot>[4]

export async function sessionShellSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionShellSnapshotDependencies,
): Promise<Result<SessionDetailResponse>> {
  const snapshot = await sessionRepositoryShellSnapshot(database, userId, organizationId, sessionId, dependencies)
  if (!snapshot.success) return snapshot

  const { projectId, ...snapshotSource } = snapshot.data
  const response = sessionDetailResponseCreate({
    ...snapshotSource,
    ...(projectId === null ? {} : { projectId }),
    userId,
  })
  if (!response.success) return createResultError("sessionShellSnapshot", response.errorMessage)
  return response
}
