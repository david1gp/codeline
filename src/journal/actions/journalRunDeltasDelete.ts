import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, inArray } from "drizzle-orm"
import type { DatabaseTransaction } from "../../database/databaseClient.js"
import { journalEventTable } from "../db/journalEventTable.js"

export async function journalRunDeltasDelete(
  transaction: DatabaseTransaction,
  runId: string,
  userIds: readonly string[],
): Promise<Result<void>> {
  const op = "journalRunDeltasDelete"
  try {
    await transaction
      .delete(journalEventTable)
      .where(
        and(
          inArray(journalEventTable.userId, userIds),
          eq(journalEventTable.eventType, "delta"),
          eq(journalEventTable.runId, runId),
        ),
      )
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The obsolete journal deltas could not be deleted.")
  }
}
