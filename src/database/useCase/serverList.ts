import type { Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../databaseClient.js"
import { serverRepositoryList } from "../repository/serverRepositoryList.js"

export function serverList(
  database: DatabaseExecutor,
  userId: string,
  search?: string,
): ReturnType<typeof serverRepositoryList> {
  return serverRepositoryList(database, userId, search)
}
