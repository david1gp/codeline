import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryChildStreamResolve } from "../db/runRepositoryChildStreamResolve.js"

export function runChildStreamResolve(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
): ReturnType<typeof runRepositoryChildStreamResolve> {
  return runRepositoryChildStreamResolve(database, userId, sessionId, streamId)
}
