import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryLoad } from "../db/sessionRepositoryLoad.js"

export function sessionLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): ReturnType<typeof sessionRepositoryLoad> {
  return sessionRepositoryLoad(database, userId, organizationId, sessionId)
}
