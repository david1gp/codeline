import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { streamRepositoryAppend } from "../db/streamRepositoryAppend.js"

export function streamAppend(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: Parameters<typeof streamRepositoryAppend>[3],
): ReturnType<typeof streamRepositoryAppend> {
  return streamRepositoryAppend(database, userId, sessionId, input)
}
