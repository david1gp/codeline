import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryDelete } from "../db/sessionRepositoryDelete.js"

export function sessionDelete(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryDelete> {
  return sessionRepositoryDelete(database, userId, sessionId)
}
