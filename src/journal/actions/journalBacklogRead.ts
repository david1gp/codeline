import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq, gt, lte } from "drizzle-orm"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { StreamSseFrame } from "../../stream/api/streamSseFrameSchema.js"
import { journalEventTable } from "../db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../db/journalSequenceCounterTable.js"
import { journalBacklogCursorSelect } from "./journalBacklogCursorSelect.js"
import { journalBacklogEventFrameCreate } from "./journalBacklogEventFrameCreate.js"

type JournalBacklogReadDependencies = {
  cursorCodec: {
    encode: (journalId: unknown, sequence: unknown) => Result<string>
    validate: (cursor: unknown, journalId: unknown) => Result<{ sequence: number }>
  }
  database: DatabaseClient
}

type JournalBacklogReadInput = {
  after?: unknown
  lastEventId?: unknown
  userId: unknown
}

type JournalBacklogReadResult = {
  afterSequence: number
  pages: AsyncIterable<Result<readonly StreamSseFrame[]>>
  replayUpperBound: number
  mode: "replay" | "reset"
  selectedCursor: string | undefined
}

type JournalBacklogRow = Pick<typeof journalEventTable.$inferSelect, "eventType" | "payload" | "sequence">

const journalBacklogPageSize = 128

function journalBacklogSequenceValidate(value: unknown, allowZero: boolean): Result<number> {
  const op = "journalBacklogRead"
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0))
    return createResultError(op, "The journal sequence is invalid.")
  return createResult(value)
}

function journalBacklogHighestSequence(nextSequence: unknown): Result<number> {
  const op = "journalBacklogRead"
  if (typeof nextSequence !== "number" || !Number.isSafeInteger(nextSequence) || nextSequence <= 0)
    return createResultErrorCode(op, "The journal sequence counter is unavailable.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

function journalBacklogBoundaryValidate(boundary: unknown): Result<number> {
  const op = "journalBacklogRead"
  if (typeof boundary !== "number" || !Number.isSafeInteger(boundary) || boundary < 0)
    return createResultErrorCode(op, "The journal replay boundary is unavailable.", "journal_unavailable")
  return createResult(boundary)
}

function journalBacklogResetFrameCreate(
  dependencies: JournalBacklogReadDependencies,
  userId: string,
  asOfSequence: number,
): Result<StreamSseFrame> {
  return journalBacklogEventFrameCreate({ cursorEncode: dependencies.cursorCodec.encode }, userId, {
    eventType: "reset",
    payload: { asOfSequence, reason: "cursor-expired" },
    sequence: asOfSequence,
  })
}

async function journalBacklogPageRead(
  dependencies: JournalBacklogReadDependencies,
  userId: string,
  afterSequence: number,
  replayUpperBound: number,
): Promise<Result<JournalBacklogRow[]>> {
  return databaseTransactionRun(dependencies.database, async (transaction): Promise<Result<JournalBacklogRow[]>> => {
    const rows = await transaction
      .select({
        eventType: journalEventTable.eventType,
        payload: journalEventTable.payload,
        sequence: journalEventTable.sequence,
      })
      .from(journalEventTable)
      .where(
        and(
          eq(journalEventTable.userId, userId),
          gt(journalEventTable.sequence, afterSequence),
          lte(journalEventTable.sequence, replayUpperBound),
        ),
      )
      .orderBy(asc(journalEventTable.sequence))
      .limit(journalBacklogPageSize)
    return createResult(rows)
  })
}

async function* journalBacklogPagesCreate(
  dependencies: JournalBacklogReadDependencies,
  userId: string,
  afterSequence: number,
  replayUpperBound: number,
  reset: StreamSseFrame | undefined,
): AsyncIterable<Result<readonly StreamSseFrame[]>> {
  if (reset !== undefined) {
    yield createResult([reset])
    return
  }

  let pageAfterSequence = afterSequence
  while (pageAfterSequence < replayUpperBound) {
    const page = await journalBacklogPageRead(dependencies, userId, pageAfterSequence, replayUpperBound)
    if (!page.success) {
      yield page
      return
    }
    if (page.data.length === 0) return

    const frames: StreamSseFrame[] = []
    for (const row of page.data) {
      const frame = journalBacklogEventFrameCreate({ cursorEncode: dependencies.cursorCodec.encode }, userId, row)
      if (!frame.success) {
        yield createResultError("journalBacklogRead", frame.errorMessage)
        return
      }
      frames.push(frame.data)
    }
    yield createResult(frames)

    const lastRow = page.data.at(-1)
    if (lastRow === undefined || lastRow.sequence <= pageAfterSequence) return
    pageAfterSequence = lastRow.sequence
    if (page.data.length < journalBacklogPageSize) return
  }
}

export async function journalBacklogRead(
  dependencies: JournalBacklogReadDependencies,
  input: JournalBacklogReadInput,
): Promise<Result<JournalBacklogReadResult>> {
  const op = "journalBacklogRead"
  const parsedUserId = v.safeParse(apiPublicIdSchema, input.userId)
  if (!parsedUserId.success)
    return createResultErrorCode(op, "The authenticated application user is invalid.", "authenticated_user_invalid")

  const selected = journalBacklogCursorSelect(input)
  if (!selected.success) return selected

  return databaseTransactionRun(
    dependencies.database,
    async (transaction): Promise<Result<JournalBacklogReadResult>> => {
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

      let afterSequence = 0
      if (selected.data.cursor !== undefined) {
        const validated = dependencies.cursorCodec.validate(selected.data.cursor, user.id)
        if (!validated.success) {
          const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
          return createResultErrorCode(op, validated.errorMessage, code)
        }
        const validatedSequence = journalBacklogSequenceValidate(validated.data.sequence, true)
        if (!validatedSequence.success) return validatedSequence
        afterSequence = validatedSequence.data
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

      const highestSequence = journalBacklogHighestSequence(counter?.nextSequence ?? 1)
      if (!highestSequence.success) return highestSequence
      const replayBoundary = journalBacklogBoundaryValidate(boundary?.prunedThroughSequence ?? 0)
      if (!replayBoundary.success) return replayBoundary

      if (
        selected.data.cursor !== undefined &&
        (afterSequence < replayBoundary.data || afterSequence > highestSequence.data)
      ) {
        const reset = journalBacklogResetFrameCreate(dependencies, user.id, highestSequence.data)
        if (!reset.success) return createResultError(op, reset.errorMessage)
        return createResult({
          afterSequence,
          pages: journalBacklogPagesCreate(dependencies, user.id, afterSequence, highestSequence.data, reset.data),
          replayUpperBound: highestSequence.data,
          mode: "reset",
          selectedCursor: selected.data.cursor,
        })
      }

      return createResult({
        afterSequence,
        pages: journalBacklogPagesCreate(dependencies, user.id, afterSequence, highestSequence.data, undefined),
        replayUpperBound: highestSequence.data,
        mode: "replay",
        selectedCursor: selected.data.cursor,
      })
    },
  )
}
