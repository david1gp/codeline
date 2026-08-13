import type { DatabaseExecutor } from "../databaseClient.js"
import { messageRepositoryListFinalized } from "../repository/messageRepositoryListFinalized.js"

export function messageListFinalized(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  options: Parameters<typeof messageRepositoryListFinalized>[3],
): ReturnType<typeof messageRepositoryListFinalized> {
  return messageRepositoryListFinalized(database, userId, sessionId, options)
}
