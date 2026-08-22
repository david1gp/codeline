import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
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
      const counterQuery = database
        .select()
        .from(journalSequenceCounterTable)
        .where(eq(journalSequenceCounterTable.userId, userId))
      const [counter] =
        options.locksAlreadyHeld === true ? await counterQuery.limit(1) : await counterQuery.for("update").limit(1)
      if (counter === undefined) return createResultError(op, "The journal sequence counter could not be locked.")
      if (!Number.isSafeInteger(counter.nextSequence) || counter.nextSequence <= 0) {
        return createResultError(op, "The journal sequence counter is invalid.")
      }

      const nextSequence = counter.nextSequence + 1
      if (!Number.isSafeInteger(nextSequence))
        return createResultError(op, "The journal sequence counter is exhausted.")
      const [updated] = await database
        .update(journalSequenceCounterTable)
        .set({ nextSequence, updatedAt: new Date() })
        .where(eq(journalSequenceCounterTable.userId, userId))
        .returning({ userId: journalSequenceCounterTable.userId })
      if (updated === undefined) return createResultError(op, "The journal sequence counter could not be advanced.")
      sequenceByUserId[userId] = counter.nextSequence
    }

    return createResult({ sequenceByUserId, userIds })
  } catch (_error) {
    return createResultError(op, "The journal sequence could not be allocated.")
  }
}
