import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq, gt, lte } from "drizzle-orm"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { journalBacklogCursorSelect } from "../../journal/actions/journalBacklogCursorSelect.js"
import { sessionDetailSseFrameCreate } from "../api/sessionDetailSseFrameCreate.js"
import type { SessionDetailSseFrame } from "../api/sessionDetailSseFrameSchema.js"
import { sessionDetailResetSseFrameCreate } from "../api/sessionDetailResetSseFrameCreate.js"
import type { sessionHistoryEntryTable } from "./sessionHistoryEntryTable.js"
import { sessionHistoryEntryTable as sessionHistoryEntries } from "./sessionHistoryEntryTable.js"
import { sessionTable } from "./sessionTable.js"
import { serverTable } from "../../servers/db/serverTable.js"

type SessionRepositoryDetailStreamBacklogReadDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "encodeSessionPosition" | "validateSessionPosition">
}

type SessionRepositoryDetailStreamBacklogReadInput = {
  after?: unknown
  lastEventId?: unknown
  organizationId: unknown
  sessionId: unknown
  userId: unknown
}

export type SessionDetailStreamBacklogReadResult = {
  afterChangePosition: number
  mode: "replay" | "reset"
  pages: AsyncIterable<Result<readonly SessionDetailSseFrame[]>>
  replayUpperBound: number
  selectedCursor: string | undefined
}

type SessionDetailHistoryEntry = typeof sessionHistoryEntryTable.$inferSelect

const sessionDetailStreamBacklogPageSize = 128

function sessionDetailStreamPositionValidate(value: unknown, allowZero: boolean): Result<number> {
  const op = "sessionRepositoryDetailStreamBacklogRead"
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    (allowZero ? value < 0 : value <= 0) ||
    value > Number.MAX_SAFE_INTEGER
  )
    return createResultError(op, "The selected-session stream position is invalid.")
  return createResult(value)
}

function sessionDetailStreamHighestPosition(nextHistoryPosition: unknown): Result<number> {
  const op = "sessionRepositoryDetailStreamBacklogRead"
  if (typeof nextHistoryPosition !== "number" || !Number.isSafeInteger(nextHistoryPosition) || nextHistoryPosition <= 0)
    return createResultErrorCode(op, "The session history position counter is unavailable.", "session_unavailable")
  return createResult(nextHistoryPosition - 1)
}

function sessionDetailStreamCursorValidate(
  dependencies: SessionRepositoryDetailStreamBacklogReadDependencies,
  cursor: unknown,
  userId: string,
  sessionId: string,
): Result<number> {
  const op = "sessionRepositoryDetailStreamBacklogRead"
  if (dependencies.cursorCodec.validateSessionPosition === undefined)
    return createResultErrorCode(op, "The selected-session stream cursor is invalid.", "cursor_invalid")
  const validated = dependencies.cursorCodec.validateSessionPosition(cursor, userId, sessionId)
  if (!validated.success) {
    const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
    return createResultErrorCode(op, validated.errorMessage, code)
  }
  return sessionDetailStreamPositionValidate(validated.data.changePosition, true)
}

async function sessionDetailStreamBacklogPageRead(
  database: DatabaseClient,
  userId: string,
  sessionId: string,
  afterChangePosition: number,
  replayUpperBound: number,
): Promise<Result<SessionDetailHistoryEntry[]>> {
  return databaseReadTransactionRun(database, async (transaction) => {
    try {
      const rows = await transaction
        .select()
        .from(sessionHistoryEntries)
        .where(
          and(
            eq(sessionHistoryEntries.userId, userId),
            eq(sessionHistoryEntries.sessionId, sessionId),
            gt(sessionHistoryEntries.changePosition, afterChangePosition),
            lte(sessionHistoryEntries.changePosition, replayUpperBound),
          ),
        )
        .orderBy(asc(sessionHistoryEntries.changePosition), asc(sessionHistoryEntries.id))
        .limit(sessionDetailStreamBacklogPageSize)
      return createResult(rows)
    } catch (_error) {
      return createResultError(
        "sessionRepositoryDetailStreamBacklogRead",
        "The selected-session stream is unavailable.",
      )
    }
  })
}

async function* sessionDetailStreamBacklogPagesCreate(
  database: DatabaseClient,
  dependencies: SessionRepositoryDetailStreamBacklogReadDependencies,
  userId: string,
  afterChangePosition: number,
  sessionId: string,
  replayUpperBound: number,
  reset: SessionDetailSseFrame | undefined,
): AsyncIterable<Result<readonly SessionDetailSseFrame[]>> {
  if (reset !== undefined) {
    yield createResult([reset])
    return
  }

  let pageAfterChangePosition = afterChangePosition
  while (pageAfterChangePosition < replayUpperBound) {
    const page = await sessionDetailStreamBacklogPageRead(
      database,
      userId,
      sessionId,
      pageAfterChangePosition,
      replayUpperBound,
    )
    if (!page.success) {
      yield page
      return
    }
    if (page.data.length === 0) return

    const frames: SessionDetailSseFrame[] = []
    for (const entry of page.data) {
      if (dependencies.cursorCodec.encodeSessionPosition === undefined) {
        yield createResultError(
          "sessionRepositoryDetailStreamBacklogRead",
          "The selected-session cursor is unavailable.",
        )
        return
      }
      const frame = sessionDetailSseFrameCreate({ cursorEncode: dependencies.cursorCodec.encodeSessionPosition }, entry)
      if (!frame.success) {
        yield createResultError("sessionRepositoryDetailStreamBacklogRead", frame.errorMessage)
        return
      }
      frames.push(frame.data)
    }
    yield createResult(frames)

    const lastEntry = page.data.at(-1)
    if (lastEntry === undefined || lastEntry.changePosition <= pageAfterChangePosition) return
    pageAfterChangePosition = lastEntry.changePosition
    if (page.data.length < sessionDetailStreamBacklogPageSize) return
  }
}

export async function sessionRepositoryDetailStreamBacklogRead(
  database: DatabaseClient,
  input: SessionRepositoryDetailStreamBacklogReadInput,
  dependencies: SessionRepositoryDetailStreamBacklogReadDependencies,
): Promise<Result<SessionDetailStreamBacklogReadResult>> {
  const op = "sessionRepositoryDetailStreamBacklogRead"
  const parsed = v.safeParse(
    v.strictObject({
      after: v.optional(v.string()),
      lastEventId: v.optional(v.string()),
      organizationId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      userId: apiPublicIdSchema,
    }),
    input,
  )
  if (!parsed.success)
    return createResultErrorCode(op, "The selected-session stream request is invalid.", "cursor_invalid")

  const selected = journalBacklogCursorSelect(parsed.output)
  if (!selected.success) return selected

  return databaseReadTransactionRun<SessionDetailStreamBacklogReadResult>(database, async (transaction) => {
    const [user] = await transaction
      .select({ id: applicationUserTable.id })
      .from(applicationUserTable)
      .where(eq(applicationUserTable.id, parsed.output.userId))
      .limit(1)
    if (user === undefined)
      return createResultErrorCode(
        op,
        "The authenticated application user was not found.",
        "authenticated_user_invalid",
      )

    const [session] = await transaction
      .select({ id: sessionTable.id, nextHistoryPosition: sessionTable.nextHistoryPosition })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, parsed.output.organizationId)),
      )
      .where(and(eq(sessionTable.id, parsed.output.sessionId), eq(sessionTable.userId, user.id)))
      .limit(1)
    if (session === undefined) return createResultErrorCode(op, "The session could not be found.", "session_not_found")

    const highestPosition = sessionDetailStreamHighestPosition(session.nextHistoryPosition)
    if (!highestPosition.success) return highestPosition

    let afterChangePosition = 0
    if (selected.data.cursor !== undefined) {
      const validated = sessionDetailStreamCursorValidate(dependencies, selected.data.cursor, user.id, session.id)
      if (!validated.success) return validated
      afterChangePosition = validated.data
    }

    if (selected.data.cursor !== undefined && afterChangePosition > highestPosition.data) {
      if (dependencies.cursorCodec.encodeSessionPosition === undefined)
        return createResultError(op, "The selected-session cursor is unavailable.")
      const reset = sessionDetailResetSseFrameCreate(
        { cursorEncode: dependencies.cursorCodec.encodeSessionPosition },
        {
          asOfPosition: highestPosition.data,
          reason: "cursor-expired",
          sessionId: session.id,
          userId: user.id,
        },
      )
      if (!reset.success) return reset
      return createResult({
        afterChangePosition,
        mode: "reset" as const,
        pages: sessionDetailStreamBacklogPagesCreate(
          database,
          dependencies,
          user.id,
          afterChangePosition,
          session.id,
          highestPosition.data,
          reset.data,
        ),
        replayUpperBound: highestPosition.data,
        selectedCursor: selected.data.cursor,
      })
    }

    return createResult({
      afterChangePosition,
      mode: "replay" as const,
      pages: sessionDetailStreamBacklogPagesCreate(
        database,
        dependencies,
        user.id,
        afterChangePosition,
        session.id,
        highestPosition.data,
        undefined,
      ),
      replayUpperBound: highestPosition.data,
      selectedCursor: selected.data.cursor,
    })
  })
}
