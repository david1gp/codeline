import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryArchive } from "../db/sessionRepositoryArchive.js"

export function sessionArchive(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryArchive> {
  return sessionRepositoryArchive(database, userId, sessionId)
}
