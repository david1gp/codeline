import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"

export function sessionCreate(
  database: DatabaseExecutor,
  userId: string,
  input: Parameters<typeof sessionRepositoryCreate>[2],
): ReturnType<typeof sessionRepositoryCreate> {
  return sessionRepositoryCreate(database, userId, input)
}
