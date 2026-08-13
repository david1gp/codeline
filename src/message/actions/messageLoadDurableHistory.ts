import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageRepositoryLoadDurableHistory } from "../db/messageRepositoryLoadDurableHistory.js"

export function messageLoadDurableHistory(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): ReturnType<typeof messageRepositoryLoadDurableHistory> {
  return messageRepositoryLoadDurableHistory(database, userId, sessionId)
}
