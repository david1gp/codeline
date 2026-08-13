import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionRepositoryLoad } from "../repository/sessionRepositoryLoad.js"

export function sessionLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryLoad> {
  return sessionRepositoryLoad(database, userId, sessionId)
}
