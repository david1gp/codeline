import type { DatabaseClient } from "../../database/databaseClient.js"
import { noteRepositoryList } from "../db/noteRepositoryList.js"

export function noteList(
  database: DatabaseClient,
  userId: string,
  organizationId?: string,
): ReturnType<typeof noteRepositoryList> {
  return noteRepositoryList(database, userId, organizationId)
}
