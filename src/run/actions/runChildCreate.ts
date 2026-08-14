import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryChildCreate } from "../db/runRepositoryChildCreate.js"

export function runChildCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: Parameters<typeof runRepositoryChildCreate>[3],
): ReturnType<typeof runRepositoryChildCreate> {
  return runRepositoryChildCreate(database, userId, sessionId, input)
}
