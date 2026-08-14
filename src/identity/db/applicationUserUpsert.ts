import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { applicationUserTable, type ApplicationUser } from "./applicationUserTable.js"

type ApplicationUserInput = {
  id: string
  displayName: string
  email?: string
}

export async function applicationUserUpsert(
  database: Pick<DatabaseClient, "insert">,
  user: ApplicationUserInput,
): Promise<Result<ApplicationUser>> {
  const op = "applicationUserUpsert"

  try {
    const [storedUser] = await database
      .insert(applicationUserTable)
      .values({
        id: user.id,
        displayName: user.displayName,
        ...(user.email === undefined ? {} : { email: user.email }),
      })
      .onConflictDoUpdate({
        set: {
          displayName: user.displayName,
          ...(user.email === undefined ? {} : { email: user.email }),
          updatedAt: new Date(),
        },
        target: applicationUserTable.id,
      })
      .returning()
    if (storedUser !== undefined) return createResult(storedUser)
    return createResultError(op, "The application user could not be stored.")
  } catch (_error) {
    return createResultError(op, "The application user could not be stored.")
  }
}
