import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { streamRepositoryListAfter } from "../db/streamRepositoryListAfter.js"

export function streamListAfter(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
  options: Parameters<typeof streamRepositoryListAfter>[4],
): ReturnType<typeof streamRepositoryListAfter> {
  return streamRepositoryListAfter(database, userId, sessionId, streamId, options)
}
