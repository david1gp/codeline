import type { Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionRepositoryBoundedHistoryPage } from "../db/sessionRepositoryBoundedHistoryPage.js"

type SessionBoundedHistoryPageDependencies = Parameters<typeof sessionRepositoryBoundedHistoryPage>[5]

export function sessionBoundedHistoryPage(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  request: Parameters<typeof sessionRepositoryBoundedHistoryPage>[4],
  dependencies: SessionBoundedHistoryPageDependencies,
): Promise<Result<SessionBoundedHistoryPage>> {
  return sessionRepositoryBoundedHistoryPage(database, userId, organizationId, sessionId, request, dependencies)
}
