import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runRepositoryCreate } from "../db/runRepositoryCreate.js"

export function runCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: Parameters<typeof runRepositoryCreate>[3],
  options: Parameters<typeof runRepositoryCreate>[4] = {},
): ReturnType<typeof runRepositoryCreate> {
  return runRepositoryCreate(database, userId, sessionId, input, options)
}
