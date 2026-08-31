import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { messageTable } from "../../message/db/messageTable.js"
import { attemptTable } from "../../run/db/attemptTable.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionBoundedHistoryPageCreate } from "../api/sessionBoundedHistoryPageCreate.js"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionOlderPageCursorPayloadSchema } from "../api/sessionOlderPageCursorPayloadSchema.js"
import {
  type SessionBoundedHistoryQuery,
  sessionBoundedHistoryQuerySchema,
} from "../schema/sessionBoundedHistoryQuerySchema.js"
import { sessionBoundedSemanticStepsCreate } from "./sessionBoundedSemanticStepsCreate.js"
import { sessionDelegationReferencesLoad } from "./sessionDelegationReferencesLoad.js"
import { sessionTable } from "./sessionTable.js"

type SessionRepositoryBoundedHistoryPageDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "decodePayload" | "encodePayload">
}

function sessionBoundedHistoryCursorDecode(
  request: SessionBoundedHistoryQuery,
  userId: string,
  sessionId: string,
  dependencies: SessionRepositoryBoundedHistoryPageDependencies,
): Result<v.InferOutput<typeof sessionOlderPageCursorPayloadSchema>> {
  const op = "sessionRepositoryBoundedHistoryPage"
  if (dependencies.cursorCodec.decodePayload === undefined)
    return createResultError(op, "The bounded session history cursor is invalid.")
  const decoded = dependencies.cursorCodec.decodePayload(request.cursor)
  if (!decoded.success) return createResultError(op, "The bounded session history cursor is invalid.")
  const parsed = v.safeParse(sessionOlderPageCursorPayloadSchema, decoded.data)
  if (!parsed.success) return createResultError(op, "The bounded session history cursor is invalid.")
  if (parsed.output.userId !== userId || parsed.output.sessionId !== sessionId)
    return createResultError(op, "The bounded session history cursor does not match the request.")
  return createResult(parsed.output)
}

export async function sessionRepositoryBoundedHistoryPage(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  request: SessionBoundedHistoryQuery,
  dependencies: SessionRepositoryBoundedHistoryPageDependencies,
): Promise<Result<SessionBoundedHistoryPage>> {
  const op = "sessionRepositoryBoundedHistoryPage"
  const parsedRequest = v.safeParse(sessionBoundedHistoryQuerySchema, request)
  if (!parsedRequest.success) return createResultError(op, "The bounded session history request is invalid.")
  const cursor = sessionBoundedHistoryCursorDecode(parsedRequest.output, userId, sessionId, dependencies)
  if (!cursor.success) return cursor

  try {
    return await databaseReadTransactionRun(database, async (transaction) => {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const messages = await transaction
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.sessionId, session.id),
            isNotNull(messageTable.finalizedAt),
            lte(messageTable.sequence, cursor.data.messageThroughSeq),
          ),
        )
        .orderBy(asc(messageTable.sequence), asc(messageTable.id))
      const runs = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.userId, userId), eq(runTable.sessionId, session.id)))
        .orderBy(asc(runTable.createdAt), asc(runTable.id))
      const runIds = runs.map((run) => run.id)
      const attempts =
        runIds.length === 0
          ? []
          : await transaction
              .select()
              .from(attemptTable)
              .where(and(eq(attemptTable.userId, userId), eq(attemptTable.sessionId, session.id)))
              .orderBy(asc(attemptTable.runId), asc(attemptTable.ordinal), asc(attemptTable.id))
      const events =
        runIds.length === 0
          ? []
          : await transaction
              .select()
              .from(journalEventTable)
              .where(
                and(
                  eq(journalEventTable.userId, userId),
                  inArray(journalEventTable.runId, runIds),
                  lte(journalEventTable.sequence, cursor.data.throughSeq),
                ),
              )
              .orderBy(asc(journalEventTable.sequence), asc(journalEventTable.id))
      const delegationReferences = await sessionDelegationReferencesLoad(
        transaction,
        userId,
        organizationId,
        session.id,
      )
      if (!delegationReferences.success) return delegationReferences
      const allSemanticSteps = sessionBoundedSemanticStepsCreate({
        attempts,
        delegationReferences: delegationReferences.data.byToolKey,
        events,
        maxSequence: cursor.data.throughSeq,
        messages,
        runs,
      })
      if (!allSemanticSteps.success) return allSemanticSteps
      const rows = allSemanticSteps.data
        .filter(
          (step) =>
            step.sequence < cursor.data.boundary.sequence ||
            (step.sequence === cursor.data.boundary.sequence && step.id < cursor.data.boundary.id),
        )
        .sort((left, right) => right.sequence - left.sequence || right.id.localeCompare(left.id))
      const hasMore = rows.length > parsedRequest.output.limit
      const pageRows = rows.slice(0, parsedRequest.output.limit).reverse()

      let nextCursor: string | null = null
      const oldestStep = pageRows[0]
      if (hasMore && oldestStep !== undefined) {
        if (dependencies.cursorCodec.encodePayload === undefined)
          return createResultError(op, "The bounded session history cursor could not be encoded.")
        const encoded = dependencies.cursorCodec.encodePayload({
          boundary: { id: oldestStep.id, sequence: oldestStep.sequence },
          kind: "session-older",
          messageThroughSeq: cursor.data.messageThroughSeq,
          sessionId,
          throughSeq: cursor.data.throughSeq,
          userId,
          version: 1,
        })
        if (!encoded.success) return createResultError(op, encoded.errorMessage)
        nextCursor = encoded.data
      }

      return sessionBoundedHistoryPageCreate({
        hasMore,
        nextCursor,
        semanticSteps: pageRows,
        throughSeq: cursor.data.throughSeq,
      })
    })
  } catch (_error) {
    return createResultError(op, "The bounded session history page could not be loaded.")
  }
}
