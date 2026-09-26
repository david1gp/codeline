import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { journalEventTable } from "../db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../db/journalSequenceCounterTable.js"
import { type JournalEventsPruneInput, journalEventsPruneInputSchema } from "../schema/journalEventsPruneInputSchema.js"
import {
  type JournalEventsPruneLimits,
  journalEventsPruneLimitsSchema,
} from "../schema/journalEventsPruneLimitsSchema.js"

const compactJournalEventTypes = [
  "invalidate",
  "run-started",
  "run-completed",
  "run-failed",
  "run-cancelled",
  "run-interrupted",
] as const
const journalEventsPruneBatchSize = 1_000

type JournalEventsPruneDependencies = {
  clock: () => Date
  database: DatabaseClient
  limits: JournalEventsPruneLimits
}

type JournalEventsPruneCursorRecoverability = {
  afterSequence: number | undefined
  reason: "gap" | "future" | "not-supplied" | "pruned" | "retained"
  recoverable: boolean | null
}

type JournalEventsPruneResult = {
  compactEventCountAfter: number
  compactEventCountBefore: number
  compactSerializedBytesAfter: number
  compactSerializedBytesBefore: number
  cursorRecoverability: JournalEventsPruneCursorRecoverability
  highestAllocatedSequence: number
  oldestPrunedSequence: number | null
  oldestRetainedCompactSequence: number | null
  newestPrunedSequence: number | null
  newestRetainedCompactSequence: number | null
  prunedEventCount: number
  prunedSerializedBytes: number
  prunedThroughSequence: number | null
  pruneBatchCount: number
  userId: string
}

type JournalEventsPruneSummary = {
  compactEventCount: number
  compactSerializedBytes: number
  expiredCompactEventCount: number
}

type JournalEventsPruneBoundary = {
  prunedThroughSequence: number
}

type JournalEventsPruneDeletedEvent = {
  createdAt: Date
  id: string
  sequence: number
  serializedBytes: number
}

function journalEventsPruneEventCompare(
  left: JournalEventsPruneDeletedEvent,
  right: JournalEventsPruneDeletedEvent,
): number {
  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime()
  if (createdAtDifference !== 0) return createdAtDifference
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function journalEventsPruneInteger(value: unknown): number | undefined {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined
  return parsed
}

async function journalEventsPruneSummary(
  database: DatabaseExecutor,
  userId: string,
  oldestAllowedTime: Date,
): Promise<Result<JournalEventsPruneSummary>> {
  const op = "journalEventsPruneSummary"
  try {
    const [summary] = await database
      .select({
        compactEventCount: sql<number>`count(*)`,
        compactSerializedBytes: sql<number>`coalesce(sum(${journalEventTable.serializedBytes}), 0)`,
        expiredCompactEventCount: sql<number>`coalesce(sum(case when ${journalEventTable.createdAt} <= ${oldestAllowedTime.getTime()} then 1 else 0 end), 0)`,
      })
      .from(journalEventTable)
      .where(
        and(eq(journalEventTable.userId, userId), inArray(journalEventTable.eventType, [...compactJournalEventTypes])),
      )
    if (summary === undefined) return createResultError(op, "The compact journal event summary could not be read.")

    const compactEventCount = journalEventsPruneInteger(summary.compactEventCount)
    const compactSerializedBytes = journalEventsPruneInteger(summary.compactSerializedBytes)
    const expiredCompactEventCount = journalEventsPruneInteger(summary.expiredCompactEventCount)
    if (
      compactEventCount === undefined ||
      compactSerializedBytes === undefined ||
      expiredCompactEventCount === undefined
    )
      return createResultError(op, "The compact journal event summary is outside the safe integer range.")
    return createResult({ compactEventCount, compactSerializedBytes, expiredCompactEventCount })
  } catch (_error) {
    return createResultError(op, "The compact journal event summary could not be read.")
  }
}

async function journalEventsPruneSizeCount(
  database: DatabaseExecutor,
  userId: string,
  bytesToRemove: number,
): Promise<Result<number>> {
  const op = "journalEventsPruneSizeCount"
  if (bytesToRemove <= 0) return createResult(0)
  try {
    const rows = await database.all<{ prefix_count?: unknown }>(sql`
      select count(*) as prefix_count
      from (
        select sum(${journalEventTable.serializedBytes}) over (
          order by ${journalEventTable.createdAt} asc, ${journalEventTable.sequence} asc, ${journalEventTable.id} asc
          rows between unbounded preceding and current row
        ) as cumulative_bytes
        from ${journalEventTable}
        where ${and(
          eq(journalEventTable.userId, userId),
          inArray(journalEventTable.eventType, [...compactJournalEventTypes]),
        )}
      ) ordered_events
      where cumulative_bytes < ${bytesToRemove}
    `)
    const [row] = rows
    const prefixCount = journalEventsPruneInteger(row?.prefix_count)
    if (prefixCount === undefined || !Number.isSafeInteger(prefixCount + 1))
      return createResultError(op, "The journal event size boundary is outside the safe integer range.")
    return createResult(prefixCount + 1)
  } catch (_error) {
    return createResultError(op, "The journal event size boundary could not be read.")
  }
}

async function journalEventsPruneBoundaryRead(
  database: DatabaseExecutor,
  userId: string,
): Promise<Result<JournalEventsPruneBoundary>> {
  const op = "journalEventsPruneBoundaryRead"
  try {
    await database
      .insert(journalReplayBoundaryTable)
      .values({ userId })
      .onConflictDoNothing({ target: journalReplayBoundaryTable.userId })
    const [boundary] = await database
      .select({ prunedThroughSequence: journalReplayBoundaryTable.prunedThroughSequence })
      .from(journalReplayBoundaryTable)
      .where(eq(journalReplayBoundaryTable.userId, userId))
      .limit(1)
    if (
      boundary === undefined ||
      !Number.isSafeInteger(boundary.prunedThroughSequence) ||
      boundary.prunedThroughSequence < 0
    )
      return createResultError(op, "The journal replay boundary could not be read.")
    return createResult(boundary)
  } catch (_error) {
    return createResultError(op, "The journal replay boundary could not be read.")
  }
}

async function journalEventsPruneRetainedSequence(
  database: DatabaseExecutor,
  userId: string,
  order: "asc" | "desc",
): Promise<Result<number | null>> {
  const op = "journalEventsPruneRetainedSequence"
  try {
    const [event] = await database
      .select({ sequence: journalEventTable.sequence })
      .from(journalEventTable)
      .where(
        and(eq(journalEventTable.userId, userId), inArray(journalEventTable.eventType, [...compactJournalEventTypes])),
      )
      .orderBy(
        ...(order === "asc"
          ? [asc(journalEventTable.createdAt), asc(journalEventTable.sequence), asc(journalEventTable.id)]
          : [desc(journalEventTable.createdAt), desc(journalEventTable.sequence), desc(journalEventTable.id)]),
      )
      .limit(1)
    return createResult(event?.sequence ?? null)
  } catch (_error) {
    return createResultError(op, "The retained compact journal boundary could not be read.")
  }
}

async function journalEventsPruneInTransaction(
  database: DatabaseExecutor,
  dependencies: JournalEventsPruneDependencies,
  input: v.InferOutput<typeof journalEventsPruneInputSchema>,
  now: Date,
): Promise<Result<JournalEventsPruneResult>> {
  const op = "journalEventsPrune"
  const oldestAllowedTime = new Date(now.getTime() - dependencies.limits.maxAgeMs)

  try {
    await database
      .insert(journalSequenceCounterTable)
      .values({ userId: input.userId })
      .onConflictDoNothing({ target: journalSequenceCounterTable.userId })

    const [counter] = await database
      .select()
      .from(journalSequenceCounterTable)
      .where(eq(journalSequenceCounterTable.userId, input.userId))
      .limit(1)
    if (
      counter === undefined ||
      !Number.isSafeInteger(counter.nextSequence) ||
      counter.nextSequence <= 0 ||
      counter.nextSequence > Number.MAX_SAFE_INTEGER
    )
      return createResultError(op, "The journal sequence counter is outside the safe integer range.")
    const highestAllocatedSequence = counter.nextSequence - 1

    const boundary = await journalEventsPruneBoundaryRead(database, input.userId)
    if (!boundary.success) return boundary
    const summaryBefore = await journalEventsPruneSummary(database, input.userId, oldestAllowedTime)
    if (!summaryBefore.success) return summaryBefore
    const sizePruneCount = await journalEventsPruneSizeCount(
      database,
      input.userId,
      summaryBefore.data.compactSerializedBytes - dependencies.limits.maxSerializedBytes,
    )
    if (!sizePruneCount.success) return sizePruneCount
    const countPruneCount = Math.max(0, summaryBefore.data.compactEventCount - dependencies.limits.maxCount)
    const pruneCount = Math.max(summaryBefore.data.expiredCompactEventCount, countPruneCount, sizePruneCount.data)
    const pruneOnlyExpired = pruneCount === summaryBefore.data.expiredCompactEventCount

    let compactEventCountAfter = summaryBefore.data.compactEventCount
    let compactSerializedBytesAfter = summaryBefore.data.compactSerializedBytes
    let oldestPrunedEvent: JournalEventsPruneDeletedEvent | undefined
    let newestPrunedEvent: JournalEventsPruneDeletedEvent | undefined
    let prunedEventCount = 0
    let prunedSerializedBytes = 0
    let prunedThroughSequence = boundary.data.prunedThroughSequence
    let pruneBatchCount = 0

    while (prunedEventCount < pruneCount) {
      const compactEventScope = and(
        eq(journalEventTable.userId, input.userId),
        inArray(journalEventTable.eventType, [...compactJournalEventTypes]),
      )
      const deletionCandidates = pruneOnlyExpired
        ? and(compactEventScope, lte(journalEventTable.createdAt, oldestAllowedTime))
        : compactEventScope
      const deletionBatchSize = Math.min(journalEventsPruneBatchSize, pruneCount - prunedEventCount)
      const deletionScope = sql`${journalEventTable.id} in (
        select ${journalEventTable.id}
        from ${journalEventTable}
        where ${deletionCandidates}
        order by ${journalEventTable.createdAt} asc, ${journalEventTable.sequence} asc, ${journalEventTable.id} asc
        limit ${deletionBatchSize}
      )`
      const deleted = (await database.delete(journalEventTable).where(deletionScope).returning({
        createdAt: journalEventTable.createdAt,
        id: journalEventTable.id,
        sequence: journalEventTable.sequence,
        serializedBytes: journalEventTable.serializedBytes,
      })) as JournalEventsPruneDeletedEvent[]
      if (deleted.length === 0) return createResultError(op, "The compact journal events could not be pruned.")

      pruneBatchCount += 1
      prunedEventCount += deleted.length
      compactEventCountAfter -= deleted.length
      for (const event of deleted) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= 0)
          return createResultError(op, "A pruned journal sequence is outside the safe integer range.")
        if (!Number.isSafeInteger(event.serializedBytes) || event.serializedBytes <= 0)
          return createResultError(op, "A pruned journal event size is outside the safe integer range.")
        if (oldestPrunedEvent === undefined || journalEventsPruneEventCompare(event, oldestPrunedEvent) < 0)
          oldestPrunedEvent = event
        if (newestPrunedEvent === undefined || journalEventsPruneEventCompare(event, newestPrunedEvent) > 0)
          newestPrunedEvent = event
        prunedSerializedBytes += event.serializedBytes
        prunedThroughSequence = Math.max(prunedThroughSequence, event.sequence)
        compactSerializedBytesAfter -= event.serializedBytes
      }
    }

    if (prunedThroughSequence !== boundary.data.prunedThroughSequence) {
      const [updatedBoundary] = await database
        .update(journalReplayBoundaryTable)
        .set({ prunedThroughSequence, updatedAt: now })
        .where(eq(journalReplayBoundaryTable.userId, input.userId))
        .returning({ prunedThroughSequence: journalReplayBoundaryTable.prunedThroughSequence })
      if (updatedBoundary === undefined)
        return createResultError(op, "The journal replay boundary could not be persisted.")
    }

    const retainedOldest = await journalEventsPruneRetainedSequence(database, input.userId, "asc")
    if (!retainedOldest.success) return retainedOldest
    const retainedNewest = await journalEventsPruneRetainedSequence(database, input.userId, "desc")
    if (!retainedNewest.success) return retainedNewest

    const cursorEvent =
      input.afterSequence === undefined
        ? undefined
        : (
            await database
              .select({ id: journalEventTable.id })
              .from(journalEventTable)
              .where(
                and(eq(journalEventTable.userId, input.userId), eq(journalEventTable.sequence, input.afterSequence)),
              )
              .limit(1)
          )[0]

    let cursorReason: JournalEventsPruneCursorRecoverability["reason"] = "not-supplied"
    let cursorRecoverable: boolean | null = null
    if (input.afterSequence !== undefined) {
      if (input.afterSequence > highestAllocatedSequence) {
        cursorReason = "future"
        cursorRecoverable = false
      } else if (input.afterSequence < prunedThroughSequence) {
        cursorReason = "pruned"
        cursorRecoverable = false
      } else if (cursorEvent !== undefined) {
        cursorReason = "retained"
        cursorRecoverable = true
      } else {
        cursorReason = "gap"
        cursorRecoverable = true
      }
    }

    return createResult({
      compactEventCountAfter,
      compactEventCountBefore: summaryBefore.data.compactEventCount,
      compactSerializedBytesAfter,
      compactSerializedBytesBefore: summaryBefore.data.compactSerializedBytes,
      cursorRecoverability: {
        afterSequence: input.afterSequence,
        reason: cursorReason,
        recoverable: cursorRecoverable,
      },
      highestAllocatedSequence,
      oldestPrunedSequence: oldestPrunedEvent?.sequence ?? null,
      oldestRetainedCompactSequence: retainedOldest.data,
      newestPrunedSequence: newestPrunedEvent?.sequence ?? null,
      newestRetainedCompactSequence: retainedNewest.data,
      prunedEventCount,
      prunedSerializedBytes,
      prunedThroughSequence:
        prunedThroughSequence === boundary.data.prunedThroughSequence && prunedEventCount === 0
          ? boundary.data.prunedThroughSequence || null
          : prunedThroughSequence || null,
      pruneBatchCount,
      userId: input.userId,
    })
  } catch (_error) {
    return createResultError(op, "The compact journal events could not be pruned.")
  }
}

export async function journalEventsPrune(
  dependencies: JournalEventsPruneDependencies,
  input: JournalEventsPruneInput,
): Promise<Result<JournalEventsPruneResult>> {
  const op = "journalEventsPrune"
  const parsedInput = v.safeParse(journalEventsPruneInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The journal prune input is invalid.")
  const parsedLimits = v.safeParse(journalEventsPruneLimitsSchema, dependencies.limits)
  if (!parsedLimits.success) return createResultError(op, "The journal prune limits are invalid.")
  if (typeof dependencies.clock !== "function") return createResultError(op, "The journal prune clock is required.")

  let now: Date
  try {
    now = dependencies.clock()
  } catch (_error) {
    return createResultError(op, "The journal prune clock failed.")
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    return createResultError(op, "The journal prune clock is invalid.")

  return databaseTransactionRun(dependencies.database, (transaction) =>
    journalEventsPruneInTransaction(
      transaction,
      { ...dependencies, limits: parsedLimits.output },
      parsedInput.output,
      now,
    ),
  )
}
