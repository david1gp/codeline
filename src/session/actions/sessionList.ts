import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryList } from "../db/sessionRepositoryList.js"

export function sessionList(
  database: DatabaseExecutor,
  userId: string,
  options: Parameters<typeof sessionRepositoryList>[2],
): ReturnType<typeof sessionRepositoryList> {
  return sessionRepositoryList(database, userId, options)
}
