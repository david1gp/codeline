import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionRepositoryLoad } from "./identitySessionRepositoryLoad.js"

export async function identitySessionResolve(
  database: Pick<DatabaseExecutor, "query">,
  token: string,
  now: Date = new Date(),
): ReturnType<typeof identitySessionRepositoryLoad> {
  return identitySessionRepositoryLoad(database, token, now)
}
