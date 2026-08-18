import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryList } from "../db/sessionRepositoryList.js"

export function sessionList(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  options: Parameters<typeof sessionRepositoryList>[3],
): ReturnType<typeof sessionRepositoryList> {
  return sessionRepositoryList(database, userId, organizationId, options)
}
