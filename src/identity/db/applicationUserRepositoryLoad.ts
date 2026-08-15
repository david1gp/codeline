import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { applicationUserTable, type ApplicationUser } from "./applicationUserTable.js"

export async function applicationUserRepositoryLoad(
  database: Pick<DatabaseExecutor, "query">,
  userId: string,
): Promise<Result<ApplicationUser | undefined>> {
  const op = "applicationUserRepositoryLoad"

  try {
    const user = await database.query.applicationUserTable.findFirst({
      where: eq(applicationUserTable.id, userId),
    })
    return createResult(user)
  } catch (_error) {
    return createResultError(op, "The application user could not be loaded.")
  }
}
