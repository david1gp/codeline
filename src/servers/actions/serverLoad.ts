import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverRepositoryLoad } from "../db/serverRepositoryLoad.js"

export function serverLoad(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
): ReturnType<typeof serverRepositoryLoad> {
  return serverRepositoryLoad(database, userId, serverId)
}
