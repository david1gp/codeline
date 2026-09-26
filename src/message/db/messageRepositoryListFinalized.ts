import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq, gt, isNotNull, or } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { type MessageListRequest, messageListRequestSchema } from "../api/messageListRequestSchema.js"
import { messageListCursorCodecCreate } from "./messageListCursorCodecCreate.js"
import { messageTable } from "./messageTable.js"

type MessageRepositoryListFinalizedDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "encodeDeterministic">
}

export async function messageRepositoryListFinalized(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  options: MessageListRequest,
  dependencies: MessageRepositoryListFinalizedDependencies,
): Promise<
  Result<{
    asOfCursor: string
    hasMore: boolean
    messages: Array<typeof messageTable.$inferSelect>
    nextCursor: string | null
    revision: number
  }>
> {
  const op = "messageRepositoryListFinalized"
  const parsedOptions = v.safeParse(messageListRequestSchema, options)
  if (!parsedOptions.success) return createResultError(op, "The message list request is invalid.")

  const cursorCodec = messageListCursorCodecCreate()
  const decodedCursor = cursorCodec.decode(parsedOptions.output.cursor)
  if (!decodedCursor.success) return decodedCursor
  if (decodedCursor.data !== undefined && decodedCursor.data.sessionId !== sessionId)
    return createResultError(op, "The message list cursor is invalid.")

  try {
    return await database.transaction(
      async (transaction) => {
        const [session] = await transaction
          .select({ id: sessionTable.id, revision: sessionTable.revision })
          .from(sessionTable)
          .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
          .where(
            and(
              eq(sessionTable.id, sessionId),
              eq(sessionTable.userId, userId),
              eq(serverTable.organizationId, organizationId),
            ),
          )
          .limit(1)
        if (session === undefined) return createResultError(op, "The session could not be found.")

        const [counter] = await transaction
          .select({ nextSequence: journalSequenceCounterTable.nextSequence })
          .from(journalSequenceCounterTable)
          .where(eq(journalSequenceCounterTable.userId, userId))
          .limit(1)
        const highestSequence = counter?.nextSequence === undefined ? 0 : counter.nextSequence - 1
        if (!Number.isSafeInteger(highestSequence) || highestSequence < 0)
          return createResultErrorCode(
            op,
            "The authenticated user's journal counter is invalid.",
            "journal_unavailable",
          )
        const asOfCursor = dependencies.cursorCodec.encodeDeterministic(userId, highestSequence)
        if (!asOfCursor.success) return createResultError(op, asOfCursor.errorMessage)

        const conditions = [
          eq(messageTable.sessionId, sessionId),
          eq(sessionTable.userId, userId),
          eq(serverTable.organizationId, organizationId),
          isNotNull(messageTable.finalizedAt),
        ]
        if (decodedCursor.data !== undefined) {
          const cursorCondition = or(
            gt(messageTable.sequence, decodedCursor.data.sequence),
            and(eq(messageTable.sequence, decodedCursor.data.sequence), gt(messageTable.id, decodedCursor.data.id)),
          )
          if (cursorCondition !== undefined) conditions.push(cursorCondition)
        }

        const rows = await transaction
          .select({ message: messageTable })
          .from(messageTable)
          .innerJoin(sessionTable, eq(messageTable.sessionId, sessionTable.id))
          .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
          .where(and(...conditions))
          .orderBy(asc(messageTable.sequence), asc(messageTable.id))
          .limit(parsedOptions.output.limit + 1)

        const hasMore = rows.length > parsedOptions.output.limit
        const page = rows.slice(0, parsedOptions.output.limit).map((row) => row.message)
        const last = page.at(-1)
        const nextCursor =
          hasMore && last !== undefined
            ? cursorCodec.encode({ id: last.id, sequence: last.sequence, sessionId, version: 1 })
            : null

        return createResult({
          asOfCursor: asOfCursor.data,
          hasMore,
          messages: page,
          nextCursor,
          revision: session.revision,
        })
      },
      { behavior: "deferred" },
    )
  } catch (_error) {
    return createResultError(op, "The finalized messages could not be loaded.")
  }
}
