import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionCompactionRepositoryBegin } from "../db/sessionCompactionRepositoryBegin.js"

export function sessionCompactionBegin(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: Parameters<typeof sessionCompactionRepositoryBegin>[4],
): ReturnType<typeof sessionCompactionRepositoryBegin> {
  return sessionCompactionRepositoryBegin(database, userId, organizationId, sessionId, input)
}
