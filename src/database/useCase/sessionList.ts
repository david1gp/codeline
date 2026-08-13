import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionRepositoryList } from "../repository/sessionRepositoryList.js"

export function sessionList(
  database: DatabaseExecutor,
  userId: string,
  options: Parameters<typeof sessionRepositoryList>[2],
): ReturnType<typeof sessionRepositoryList> {
  return sessionRepositoryList(database, userId, options)
}
