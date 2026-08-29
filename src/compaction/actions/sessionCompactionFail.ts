import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionCompactionRepositoryFail } from "../db/sessionCompactionRepositoryFail.js"

export function sessionCompactionFail(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: Parameters<typeof sessionCompactionRepositoryFail>[4],
): ReturnType<typeof sessionCompactionRepositoryFail> {
  return sessionCompactionRepositoryFail(database, userId, organizationId, sessionId, input)
}
