import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryPin } from "../db/sessionRepositoryPin.js"

export function sessionPin(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  pinned: boolean,
): ReturnType<typeof sessionRepositoryPin> {
  return sessionRepositoryPin(database, userId, sessionId, pinned)
}
