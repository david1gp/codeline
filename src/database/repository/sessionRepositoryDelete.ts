import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionTable } from "../schema/sessionTable.js"

export async function sessionRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<Result<typeof sessionTable.$inferSelect>> {
  const op = "sessionRepositoryDelete"

  try {
    const [session] = await database
      .delete(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning()
    if (session !== undefined) return createResult(session)
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be deleted.")
  }
}
