import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryBranch } from "../db/sessionRepositoryBranch.js"

export function sessionBranch(
  database: DatabaseExecutor,
  userId: string,
  sourceSessionId: string,
  input: Parameters<typeof sessionRepositoryBranch>[3],
): ReturnType<typeof sessionRepositoryBranch> {
  return sessionRepositoryBranch(database, userId, sourceSessionId, input)
}
