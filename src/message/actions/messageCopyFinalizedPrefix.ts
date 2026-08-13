import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageRepositoryCopyFinalizedPrefix } from "../db/messageRepositoryCopyFinalizedPrefix.js"

export function messageCopyFinalizedPrefix(
  database: DatabaseExecutor,
  userId: string,
  sourceSessionId: string,
  targetSessionId: string,
  messageId: string,
): ReturnType<typeof messageRepositoryCopyFinalizedPrefix> {
  return messageRepositoryCopyFinalizedPrefix(database, userId, sourceSessionId, targetSessionId, messageId)
}
