import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { messageRepositoryAppend } from "../db/messageRepositoryAppend.js"

export function messageAppend(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: Parameters<typeof messageRepositoryAppend>[3],
): ReturnType<typeof messageRepositoryAppend> {
  return databaseExecutorTransactionRun(database, (executor) =>
    messageRepositoryAppend(executor, userId, sessionId, input),
  )
}
