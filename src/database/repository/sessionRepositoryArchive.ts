import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../databaseClient.js"
import { sessionTable } from "../schema/sessionTable.js"

export async function sessionRepositoryArchive(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<Result<typeof sessionTable.$inferSelect>> {
  const op = "sessionRepositoryArchive"

  try {
    const [session] = await database
      .update(sessionTable)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId), isNull(sessionTable.archivedAt)))
      .returning()
    if (session !== undefined) return createResult(session)

    const [alreadyArchived] = await database
      .select()
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (alreadyArchived !== undefined) return createResult(alreadyArchived)
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be archived.")
  }
}
