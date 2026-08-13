import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { streamCheckpointRepositoryLoadOrCreate } from "../db/streamCheckpointRepositoryLoadOrCreate.js"

export function streamCheckpointLoadOrCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
): ReturnType<typeof streamCheckpointRepositoryLoadOrCreate> {
  return streamCheckpointRepositoryLoadOrCreate(database, userId, sessionId, streamId)
}
