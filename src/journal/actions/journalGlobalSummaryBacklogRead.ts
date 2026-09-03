import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq, gt, inArray, lte } from "drizzle-orm"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { GlobalSummarySseFrame } from "../../stream/api/globalSummarySseFrameSchema.js"
import { journalEventTable } from "../db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../db/journalSequenceCounterTable.js"
import { journalBacklogCursorSelect } from "./journalBacklogCursorSelect.js"
import { journalGlobalSummaryEventFrameCreate } from "./journalGlobalSummaryEventFrameCreate.js"

type JournalGlobalSummaryBacklogReadDependencies = {
  cursorCodec: {
    encodeGlobalSequence?: (journalId: unknown, globalSequence: unknown) => Result<string>
    validateGlobalSequence?: (cursor: unknown, journalId: unknown) => Result<{ globalSequence: number }>
  }
  database: DatabaseClient
}

type JournalGlobalSummaryBacklogReadInput = {
  after?: unknown
  lastEventId?: unknown
  userId: unknown
}

type JournalGlobalSummaryBacklogReadResult = {
  afterGlobalSequence: number
  pages: AsyncIterable<Result<readonly GlobalSummarySseFrame[]>>
  replayUpperBound: number
  selectedCursor: string | undefined
  mode: "replay" | "reset"
}

type JournalGlobalSummaryBacklogRow = Pick<typeof journalEventTable.$inferSelect, "eventType" | "payload"> & {
  globalSequence: number
}

const journalGlobalSummaryBacklogPageSize = 128
const journalGlobalSummaryEventTypes = [
  "input-needed",
  "invalidate",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
  "run-started",
] as const

function journalGlobalSummarySequenceValidate(value: unknown, allowZero: boolean): Result<number> {
  const op = "journalGlobalSummaryBacklogRead"
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0))
    return createResultError(op, "The global sequence is invalid.")
  return createResult(value)
}

function journalGlobalSummaryHighestSequence(nextSequence: unknown): Result<number> {
  const op = "journalGlobalSummaryBacklogRead"
  if (typeof nextSequence !== "number" || !Number.isSafeInteger(nextSequence) || nextSequence <= 0)
    return createResultErrorCode(op, "The global sequence counter is unavailable.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

function journalGlobalSummaryBoundaryValidate(boundary: unknown): Result<number> {
  const op = "journalGlobalSummaryBacklogRead"
  if (typeof boundary !== "number" || !Number.isSafeInteger(boundary) || boundary < 0)
    return createResultErrorCode(op, "The global replay boundary is unavailable.", "journal_unavailable")
  return createResult(boundary)
}

function journalGlobalSummaryResetFrameCreate(
  dependencies: JournalGlobalSummaryBacklogReadDependencies,
  userId: string,
  asOfGlobalSequence: number,
): Result<GlobalSummarySseFrame> {
  return journalGlobalSummaryEventFrameCreate(
    {
      cursorEncode: (journalId, globalSequence) =>
        journalGlobalSummaryCursorEncode(dependencies.cursorCodec, journalId, globalSequence),
    },
    userId,
    {
      eventType: "reset",
      payload: { asOfGlobalSequence, reason: "cursor-expired" },
      globalSequence: asOfGlobalSequence,
    },
  )
}

function journalGlobalSummaryCursorEncode(
  cursorCodec: JournalGlobalSummaryBacklogReadDependencies["cursorCodec"],
  userId: unknown,
  globalSequence: unknown,
): Result<string> {
  if (typeof cursorCodec.encodeGlobalSequence !== "function")
    return createResultError("journalGlobalSummaryBacklogRead", "The global summary cursor codec is required.")
  return cursorCodec.encodeGlobalSequence(userId, globalSequence)
}

function journalGlobalSummaryCursorValidate(
  cursorCodec: JournalGlobalSummaryBacklogReadDependencies["cursorCodec"],
  cursor: unknown,
  userId: string,
): Result<{ globalSequence: number }> {
  if (typeof cursorCodec.validateGlobalSequence !== "function")
    return createResultError("journalGlobalSummaryBacklogRead", "The global summary cursor codec is required.")
  return cursorCodec.validateGlobalSequence(cursor, userId)
}

async function journalGlobalSummaryBacklogPageRead(
  dependencies: JournalGlobalSummaryBacklogReadDependencies,
  userId: string,
  afterGlobalSequence: number,
  replayUpperBound: number,
): Promise<Result<JournalGlobalSummaryBacklogRow[]>> {
  return databaseTransactionRun(
    dependencies.database,
    async (transaction): Promise<Result<JournalGlobalSummaryBacklogRow[]>> => {
      const rows = await transaction
        .select({
          eventType: journalEventTable.eventType,
          globalSequence: journalEventTable.sequence,
          payload: journalEventTable.payload,
        })
        .from(journalEventTable)
        .where(
          and(
            eq(journalEventTable.userId, userId),
            gt(journalEventTable.sequence, afterGlobalSequence),
            lte(journalEventTable.sequence, replayUpperBound),
            inArray(journalEventTable.eventType, [...journalGlobalSummaryEventTypes]),
          ),
        )
        .orderBy(asc(journalEventTable.sequence))
        .limit(journalGlobalSummaryBacklogPageSize)
      return createResult(rows)
    },
  )
}

async function* journalGlobalSummaryBacklogPagesCreate(
  dependencies: JournalGlobalSummaryBacklogReadDependencies,
  userId: string,
  afterGlobalSequence: number,
  replayUpperBound: number,
  reset: GlobalSummarySseFrame | undefined,
): AsyncIterable<Result<readonly GlobalSummarySseFrame[]>> {
  if (reset !== undefined) {
    yield createResult([reset])
    return
  }

  let pageAfterGlobalSequence = afterGlobalSequence
  while (pageAfterGlobalSequence < replayUpperBound) {
    const page = await journalGlobalSummaryBacklogPageRead(
      dependencies,
      userId,
      pageAfterGlobalSequence,
      replayUpperBound,
    )
    if (!page.success) {
      yield page
      return
    }
    if (page.data.length === 0) return

    const frames: GlobalSummarySseFrame[] = []
    for (const row of page.data) {
      const frame = journalGlobalSummaryEventFrameCreate(
        {
          cursorEncode: (journalId, globalSequence) =>
            journalGlobalSummaryCursorEncode(dependencies.cursorCodec, journalId, globalSequence),
        },
        userId,
        row,
      )
      if (!frame.success) {
        if (frame.code === "global_summary_payload_invalid") continue
        yield createResultError("journalGlobalSummaryBacklogRead", frame.errorMessage)
        return
      }
      frames.push(frame.data)
    }
    yield createResult(frames)

    const lastRow = page.data.at(-1)
    if (lastRow === undefined || lastRow.globalSequence <= pageAfterGlobalSequence) return
    pageAfterGlobalSequence = lastRow.globalSequence
    if (page.data.length < journalGlobalSummaryBacklogPageSize) return
  }
}

export async function journalGlobalSummaryBacklogRead(
  dependencies: JournalGlobalSummaryBacklogReadDependencies,
  input: JournalGlobalSummaryBacklogReadInput,
): Promise<Result<JournalGlobalSummaryBacklogReadResult>> {
  const op = "journalGlobalSummaryBacklogRead"
  const parsedUserId = v.safeParse(apiPublicIdSchema, input.userId)
  if (!parsedUserId.success)
    return createResultErrorCode(op, "The authenticated application user is invalid.", "authenticated_user_invalid")

  const selected = journalBacklogCursorSelect(input)
  if (!selected.success) return selected

  return databaseTransactionRun(
    dependencies.database,
    async (transaction): Promise<Result<JournalGlobalSummaryBacklogReadResult>> => {
      const [user] = await transaction
        .select({ id: applicationUserTable.id })
        .from(applicationUserTable)
        .where(eq(applicationUserTable.id, parsedUserId.output))
        .limit(1)
      if (user === undefined)
        return createResultErrorCode(
          op,
          "The authenticated application user was not found.",
          "authenticated_user_invalid",
        )

      // A fresh browser has no prior global state to reconcile. Its resource
      // snapshots are authoritative, so begin the live handoff at the current
      // sequence instead of replaying every historical lifecycle summary.
      let afterGlobalSequence = 0
      if (selected.data.cursor !== undefined) {
        const validated = journalGlobalSummaryCursorValidate(dependencies.cursorCodec, selected.data.cursor, user.id)
        if (!validated.success) {
          const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
          return createResultErrorCode(op, validated.errorMessage, code)
        }
        const validatedSequence = journalGlobalSummarySequenceValidate(validated.data.globalSequence, true)
        if (!validatedSequence.success) return validatedSequence
        afterGlobalSequence = validatedSequence.data
      }

      const [counter] = await transaction
        .select({ nextSequence: journalSequenceCounterTable.nextSequence })
        .from(journalSequenceCounterTable)
        .where(eq(journalSequenceCounterTable.userId, user.id))
        .limit(1)
      const [boundary] = await transaction
        .select({ prunedThroughSequence: journalReplayBoundaryTable.prunedThroughSequence })
        .from(journalReplayBoundaryTable)
        .where(eq(journalReplayBoundaryTable.userId, user.id))
        .limit(1)

      const highestSequence = journalGlobalSummaryHighestSequence(counter?.nextSequence ?? 1)
      if (!highestSequence.success) return highestSequence
      const replayBoundary = journalGlobalSummaryBoundaryValidate(boundary?.prunedThroughSequence ?? 0)
      if (!replayBoundary.success) return replayBoundary

      if (selected.data.cursor === undefined) afterGlobalSequence = highestSequence.data

      // A cursor below the durable deletion boundary cannot replay every
      // summary after it, even when an older compact event remains retained.
      if (
        selected.data.cursor !== undefined &&
        (afterGlobalSequence < replayBoundary.data || afterGlobalSequence > highestSequence.data)
      ) {
        const reset = journalGlobalSummaryResetFrameCreate(dependencies, user.id, highestSequence.data)
        if (!reset.success) return createResultError(op, reset.errorMessage)
        return createResult({
          afterGlobalSequence,
          pages: journalGlobalSummaryBacklogPagesCreate(
            dependencies,
            user.id,
            afterGlobalSequence,
            highestSequence.data,
            reset.data,
          ),
          replayUpperBound: highestSequence.data,
          mode: "reset",
          selectedCursor: selected.data.cursor,
        })
      }

      return createResult({
        afterGlobalSequence,
        pages: journalGlobalSummaryBacklogPagesCreate(
          dependencies,
          user.id,
          afterGlobalSequence,
          highestSequence.data,
          undefined,
        ),
        replayUpperBound: highestSequence.data,
        mode: "replay",
        selectedCursor: selected.data.cursor,
      })
    },
  )
}
