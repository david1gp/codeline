import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionTable } from "./identitySessionTable.js"

/**
 * Moves one identity session's expiry to an explicit instant. The caller supplies
 * the instant, so the same repository serves a shortened lifetime, a forced
 * expiry, and a deterministic test clock without a second write path.
 */
export async function identitySessionRepositoryExpire(
  database: Pick<DatabaseExecutor, "select" | "update">,
  sessionId: string,
  expiresAt: Date,
): Promise<Result<typeof identitySessionTable.$inferSelect>> {
  const op = "identitySessionRepositoryExpire"

  try {
    const [expiredSession] = await database
      .update(identitySessionTable)
      .set({ expiresAt })
      .where(eq(identitySessionTable.id, sessionId))
      .returning()
    if (expiredSession !== undefined) return createResult(expiredSession)
    return createResultError(op, "The identity session could not be found.")
  } catch (_error) {
    return createResultError(op, "The identity session expiry could not be updated.")
  }
}
