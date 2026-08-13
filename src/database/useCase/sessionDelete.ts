import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionRepositoryDelete } from "../repository/sessionRepositoryDelete.js"

export function sessionDelete(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryDelete> {
  return sessionRepositoryDelete(database, userId, sessionId)
}
