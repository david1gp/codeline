import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionTable } from "./identitySessionTable.js"

export async function identitySessionRepositoryRevoke(
  database: Pick<DatabaseExecutor, "select" | "update">,
  sessionId: string,
  now: Date = new Date(),
): Promise<Result<typeof identitySessionTable.$inferSelect>> {
  const op = "identitySessionRepositoryRevoke"

  try {
    const [revokedSession] = await database
      .update(identitySessionTable)
      .set({ revokedAt: now })
      .where(and(eq(identitySessionTable.id, sessionId), isNull(identitySessionTable.revokedAt)))
      .returning()
    if (revokedSession !== undefined) return createResult(revokedSession)

    const [existingSession] = await database
      .select()
      .from(identitySessionTable)
      .where(eq(identitySessionTable.id, sessionId))
      .limit(1)
    if (existingSession !== undefined) return createResult(existingSession)
    return createResultError(op, "The identity session could not be found.")
  } catch (_error) {
    return createResultError(op, "The identity session could not be revoked.")
  }
}
