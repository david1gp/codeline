import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryBranch } from "../db/sessionRepositoryBranch.js"

export function sessionBranch(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sourceSessionId: string,
  input: Parameters<typeof sessionRepositoryBranch>[4],
): ReturnType<typeof sessionRepositoryBranch> {
  return sessionRepositoryBranch(database, userId, organizationId, sourceSessionId, input)
}
