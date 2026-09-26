import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionCompactionRepositoryFinalize } from "../db/sessionCompactionRepositoryFinalize.js"

export function sessionCompactionFinalize(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: Parameters<typeof sessionCompactionRepositoryFinalize>[4],
): ReturnType<typeof sessionCompactionRepositoryFinalize> {
  return sessionCompactionRepositoryFinalize(database, userId, organizationId, sessionId, input)
}
