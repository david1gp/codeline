import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionRepositoryLoad } from "../db/identitySessionRepositoryLoad.js"

export function identitySessionLoad(
  database: Pick<DatabaseExecutor, "query">,
  token: string,
  now: Date = new Date(),
): ReturnType<typeof identitySessionRepositoryLoad> {
  return identitySessionRepositoryLoad(database, token, now)
}
