import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, lt, sql } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "./sessionTable.js"

const sessionHistoryPositionMaximum = Number.MAX_SAFE_INTEGER

export async function sessionHistoryEntryPositionAllocate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<Result<number>> {
  const op = "sessionHistoryEntryPositionAllocate"

  try {
    const [session] = await database
      .update(sessionTable)
      .set({
        nextHistoryPosition: sql`${sessionTable.nextHistoryPosition} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessionTable.id, sessionId),
          eq(sessionTable.userId, userId),
          lt(sessionTable.nextHistoryPosition, sessionHistoryPositionMaximum),
        ),
      )
      .returning({ nextHistoryPosition: sessionTable.nextHistoryPosition })

    if (session === undefined)
      return createResultError(op, "The session could not be found or has exhausted history positions.")

    return createResult(session.nextHistoryPosition - 1)
  } catch (_error) {
    return createResultError(op, "The session history position could not be allocated.")
  }
}
