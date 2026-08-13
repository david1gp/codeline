import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionTable } from "../schema/sessionTable.js"

export async function sessionRepositoryRename(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  title: string,
): Promise<Result<typeof sessionTable.$inferSelect>> {
  const op = "sessionRepositoryRename"

  try {
    const [session] = await database
      .update(sessionTable)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning()
    if (session !== undefined) return createResult(session)
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be renamed.")
  }
}
