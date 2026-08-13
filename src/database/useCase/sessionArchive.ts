import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionRepositoryArchive } from "../repository/sessionRepositoryArchive.js"

export function sessionArchive(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryArchive> {
  return sessionRepositoryArchive(database, userId, sessionId)
}
