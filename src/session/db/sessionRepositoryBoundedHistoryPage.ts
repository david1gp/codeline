import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, lt, lte } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionBoundedHistoryPageCreate } from "../api/sessionBoundedHistoryPageCreate.js"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionOlderPageCursorPayloadSchema } from "../api/sessionOlderPageCursorPayloadSchema.js"
import {
  type SessionBoundedHistoryQuery,
  sessionBoundedHistoryQuerySchema,
} from "../schema/sessionBoundedHistoryQuerySchema.js"
import { sessionHistoryEntrySemanticStepCreate } from "./sessionHistoryEntrySemanticStepCreate.js"
import { sessionHistoryEntryTable } from "./sessionHistoryEntryTable.js"
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
        .select({ id: sessionTable.id, nextHistoryPosition: sessionTable.nextHistoryPosition })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const currentThroughPosition = session.nextHistoryPosition - 1
      if (!Number.isSafeInteger(currentThroughPosition) || cursor.data.throughPosition > currentThroughPosition)
        return createResultError(op, "The bounded session history cursor is invalid.")

      const rows = await transaction
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.userId, userId),
            eq(sessionHistoryEntryTable.sessionId, session.id),
            lt(sessionHistoryEntryTable.position, cursor.data.beforePosition),
            lte(sessionHistoryEntryTable.position, cursor.data.throughPosition),
          ),
        )
        .orderBy(desc(sessionHistoryEntryTable.position))
        .limit(parsedRequest.output.limit + 1)
      const hasMore = rows.length > parsedRequest.output.limit
      const pageRows = rows.slice(0, parsedRequest.output.limit).toReversed()
      const semanticSteps: SessionBoundedHistoryPage["semanticSteps"] = []
      for (const entry of pageRows) {
        const step = sessionHistoryEntrySemanticStepCreate(entry)
        if (!step.success) return step
        semanticSteps.push(step.data)
      }

      let nextCursor: string | null = null
      const oldestEntry = rows.at(parsedRequest.output.limit - 1)
      if (hasMore && oldestEntry !== undefined) {
        if (dependencies.cursorCodec.encodePayload === undefined)
          return createResultError(op, "The bounded session history cursor could not be encoded.")
        const encoded = dependencies.cursorCodec.encodePayload({
          beforePosition: oldestEntry.position,
          kind: "session-older",
          sessionId,
          throughPosition: cursor.data.throughPosition,
          userId,
          version: 1,
        })
        if (!encoded.success) return createResultError(op, encoded.errorMessage)
        nextCursor = encoded.data
      }

      return sessionBoundedHistoryPageCreate({
        hasMore,
        nextCursor,
        semanticSteps,
        throughPosition: cursor.data.throughPosition,
      })
    })
  } catch (_error) {
    return createResultError(op, "The bounded session history page could not be loaded.")
  }
}
