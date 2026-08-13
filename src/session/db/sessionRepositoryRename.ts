import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "./sessionTable.js"

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
    return createResultError(op, "The session could not be renamed.")
  }
}
