import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryWatch(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  watched: boolean,
): Promise<Result<typeof sessionTable.$inferSelect>> {
  const op = "sessionRepositoryWatch"

  try {
    const [session] = await database
      .update(sessionTable)
      .set({ updatedAt: new Date(), watched })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId), isNull(sessionTable.archivedAt)))
      .returning()
    if (session !== undefined) return createResult(session)

    const [archived] = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (archived !== undefined) return createResultError(op, "The session is archived.")
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be watched.")
  }
}
