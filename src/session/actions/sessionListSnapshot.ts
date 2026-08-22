import { createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { sessionListSnapshotResponseCreate } from "../api/sessionListSnapshotResponseCreate.js"
import { sessionRepositoryListSnapshot } from "../db/sessionRepositoryListSnapshot.js"

type SessionListSnapshotDependencies = Parameters<typeof sessionRepositoryListSnapshot>[4]

export async function sessionListSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  options: Parameters<typeof sessionRepositoryListSnapshot>[3],
  dependencies: SessionListSnapshotDependencies,
): Promise<ReturnType<typeof sessionListSnapshotResponseCreate>> {
  const snapshot = await sessionRepositoryListSnapshot(database, userId, organizationId, options, dependencies)
  if (!snapshot.success) return snapshot
  const response = sessionListSnapshotResponseCreate({
    ...snapshot.data,
    representationIdentity: `session-list:${userId}:${organizationId}:${JSON.stringify(options)}`,
  })
  if (!response.success) return createResultError("sessionListSnapshot", response.errorMessage)
  return response
}
