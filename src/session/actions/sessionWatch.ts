import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryWatch } from "../db/sessionRepositoryWatch.js"

export function sessionWatch(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  watched: boolean,
): ReturnType<typeof sessionRepositoryWatch> {
  return sessionRepositoryWatch(database, userId, sessionId, watched)
}
