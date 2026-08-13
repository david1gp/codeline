import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionRepositoryRename } from "../repository/sessionRepositoryRename.js"

export function sessionRename(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  title: string,
): ReturnType<typeof sessionRepositoryRename> {
  return sessionRepositoryRename(database, userId, sessionId, title)
}
