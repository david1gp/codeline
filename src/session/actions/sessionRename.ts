import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryRename } from "../db/sessionRepositoryRename.js"

export function sessionRename(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  title: string,
): ReturnType<typeof sessionRepositoryRename> {
  return sessionRepositoryRename(database, userId, sessionId, title)
}
