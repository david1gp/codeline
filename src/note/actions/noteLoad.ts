import type { DatabaseClient } from "../../database/databaseClient.js"
import { noteRepositoryLoad } from "../db/noteRepositoryLoad.js"

export function noteLoad(
  database: DatabaseClient,
  userId: string,
  noteId: string,
  organizationId?: string,
): ReturnType<typeof noteRepositoryLoad> {
  return noteRepositoryLoad(database, userId, noteId, organizationId)
}
