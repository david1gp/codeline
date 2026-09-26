import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionCompactionRepositoryLoadLatestSuccessful } from "../db/sessionCompactionRepositoryLoadLatestSuccessful.js"

export function sessionCompactionLoadLatestSuccessful(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof sessionCompactionRepositoryLoadLatestSuccessful> {
  return sessionCompactionRepositoryLoadLatestSuccessful(database, userId, organizationId, sessionId)
}
