import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { journalSequenceCounterTable } from "../db/journalSequenceCounterTable.js"
import { journalAuthorizedUserIdsSchema } from "../schema/journalAuthorizedUserIdsSchema.js"

function journalUserIdsSort(userIds: readonly string[]): string[] {
  return [...new Set(userIds)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

export async function journalSequenceLocksAcquire(
  database: DatabaseExecutor,
  authorizedUserIds: readonly string[],
): Promise<Result<string[]>> {
  const op = "journalSequenceLocksAcquire"
  const parsedUserIds = v.safeParse(journalAuthorizedUserIdsSchema, authorizedUserIds)
  if (!parsedUserIds.success) return createResultError(op, "The authorized journal users are invalid.")

  const userIds = journalUserIdsSort(parsedUserIds.output)
  if (userIds.length === 0) return createResultError(op, "At least one authorized journal user is required.")

  try {
    for (const userId of userIds) {
      await database
        .insert(journalSequenceCounterTable)
        .values({ userId })
        .onConflictDoNothing({ target: journalSequenceCounterTable.userId })
    }

    for (const userId of userIds) {
      const [counter] = await database
        .select({ userId: journalSequenceCounterTable.userId })
        .from(journalSequenceCounterTable)
        .where(eq(journalSequenceCounterTable.userId, userId))
        .for("update")
        .limit(1)
      if (counter === undefined) return createResultError(op, "The journal sequence counter could not be locked.")
    }

    return createResult(userIds)
  } catch (_error) {
    return createResultError(op, "The journal sequence counters could not be locked.")
  }
}
