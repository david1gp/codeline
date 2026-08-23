import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, gt, lt, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { journalSequenceCounterTable } from "../db/journalSequenceCounterTable.js"
import { journalAuthorizedUserIdsSchema } from "../schema/journalAuthorizedUserIdsSchema.js"
import { journalSequenceLocksAcquire } from "./journalSequenceLocksAcquire.js"

type JournalSequenceAllocation = {
  sequenceByUserId: Record<string, number>
  userIds: string[]
}

type JournalSequenceAllocateOptions = {
  locksAlreadyHeld?: boolean
}

export async function journalSequenceAllocate(
  database: DatabaseExecutor,
  authorizedUserIds: readonly string[],
  options: JournalSequenceAllocateOptions = {},
): Promise<Result<JournalSequenceAllocation>> {
  const op = "journalSequenceAllocate"
  let userIds: string[]
  if (options.locksAlreadyHeld === true) {
    const parsedUserIds = v.safeParse(journalAuthorizedUserIdsSchema, authorizedUserIds)
    if (!parsedUserIds.success) return createResultError(op, "The authorized journal users are invalid.")
    userIds = [...new Set(parsedUserIds.output)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    if (userIds.length === 0) return createResultError(op, "At least one authorized journal user is required.")
  } else {
    const locked = await journalSequenceLocksAcquire(database, authorizedUserIds)
    if (!locked.success) return createResultError(op, locked.errorMessage)
    userIds = locked.data
  }

  try {
    const sequenceByUserId: Record<string, number> = {}
    for (const userId of userIds) {
      const [updated] = await database
        .update(journalSequenceCounterTable)
        .set({ nextSequence: sql`${journalSequenceCounterTable.nextSequence} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(journalSequenceCounterTable.userId, userId),
            gt(journalSequenceCounterTable.nextSequence, 0),
            lt(journalSequenceCounterTable.nextSequence, Number.MAX_SAFE_INTEGER),
          ),
        )
        .returning({ nextSequence: journalSequenceCounterTable.nextSequence })
      if (updated === undefined) {
        const [counter] = await database
          .select({ nextSequence: journalSequenceCounterTable.nextSequence })
          .from(journalSequenceCounterTable)
          .where(eq(journalSequenceCounterTable.userId, userId))
          .limit(1)
        if (counter === undefined) return createResultError(op, "The journal sequence counter could not be advanced.")
        if (!Number.isSafeInteger(counter.nextSequence) || counter.nextSequence <= 0)
          return createResultError(op, "The journal sequence counter is invalid.")
        return createResultError(op, "The journal sequence counter is exhausted.")
      }

      const sequence = updated.nextSequence - 1
      if (!Number.isSafeInteger(sequence) || sequence <= 0)
        return createResultError(op, "The journal sequence counter is invalid.")
      sequenceByUserId[userId] = sequence
    }

    return createResult({ sequenceByUserId, userIds })
  } catch (_error) {
    return createResultError(op, "The journal sequence could not be allocated.")
  }
}
