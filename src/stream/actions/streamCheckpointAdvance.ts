import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { streamCheckpointRepositoryAdvance } from "../db/streamCheckpointRepositoryAdvance.js"

export function streamCheckpointAdvance(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
  lastSequence: number,
): ReturnType<typeof streamCheckpointRepositoryAdvance> {
  return streamCheckpointRepositoryAdvance(database, userId, sessionId, streamId, lastSequence)
}
