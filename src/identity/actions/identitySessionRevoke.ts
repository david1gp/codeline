import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionRepositoryRevoke } from "../db/identitySessionRepositoryRevoke.js"

export function identitySessionRevoke(
  database: Pick<DatabaseExecutor, "select" | "update">,
  sessionId: string,
  now: Date = new Date(),
): ReturnType<typeof identitySessionRepositoryRevoke> {
  return identitySessionRepositoryRevoke(database, sessionId, now)
}
