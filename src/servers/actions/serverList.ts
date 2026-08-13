import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverRepositoryList } from "../db/serverRepositoryList.js"

export function serverList(
  database: DatabaseExecutor,
  userId: string,
  search?: string,
): ReturnType<typeof serverRepositoryList> {
  return serverRepositoryList(database, userId, search)
}
