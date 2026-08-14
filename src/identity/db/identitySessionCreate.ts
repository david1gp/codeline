import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionRepositoryCreate } from "./identitySessionRepositoryCreate.js"

export async function identitySessionCreate(
  database: Pick<DatabaseExecutor, "insert">,
  session: Parameters<typeof identitySessionRepositoryCreate>[1],
): ReturnType<typeof identitySessionRepositoryCreate> {
  return identitySessionRepositoryCreate(database, session)
}
