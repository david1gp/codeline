import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { and, asc, eq, gt, isNotNull, or } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageTable } from "./messageTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"

const messageCursorSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

type MessageCursor = v.InferOutput<typeof messageCursorSchema>

function messageCursorDecode(cursor: string | undefined): Result<MessageCursor | undefined> {
  const op = "messageCursorDecode"
  if (cursor === undefined) return createResult(undefined)

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    const parsed = v.safeParse(messageCursorSchema, decoded)
    if (!parsed.success) return createResultError(op, "The message list cursor is invalid.")
    return createResult(parsed.output)
  } catch (_error) {
    return createResultError(op, "The message list cursor is invalid.")
  }
}

function messageCursorEncode(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export async function messageRepositoryListFinalized(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  options: { cursor?: string; limit: number },
): Promise<Result<{ messages: Array<typeof messageTable.$inferSelect>; nextCursor: string | null }>> {
  const op = "messageRepositoryListFinalized"
  const decodedCursor = messageCursorDecode(options.cursor)
  if (!decodedCursor.success) return decodedCursor

  try {
    const [session] = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    const conditions = [
      eq(messageTable.sessionId, sessionId),
      eq(sessionTable.userId, userId),
      isNotNull(messageTable.finalizedAt),
    ]
    if (decodedCursor.data !== undefined) {
      const cursorCondition = or(
        gt(messageTable.sequence, decodedCursor.data.sequence),
        and(eq(messageTable.sequence, decodedCursor.data.sequence), gt(messageTable.id, decodedCursor.data.id)),
      )
      if (cursorCondition !== undefined) conditions.push(cursorCondition)
    }

    const rows = await database
      .select({ message: messageTable })
      .from(messageTable)
      .innerJoin(sessionTable, eq(messageTable.sessionId, sessionTable.id))
      .where(and(...conditions))
      .orderBy(asc(messageTable.sequence), asc(messageTable.id))
      .limit(options.limit + 1)

    const page = rows.slice(0, options.limit).map((row) => row.message)
    const last = page.at(-1)
    const nextCursor =
      rows.length > options.limit && last !== undefined
        ? messageCursorEncode({ id: last.id, sequence: last.sequence })
        : null

    return createResult({ messages: page, nextCursor })
  } catch (_error) {
    return createResultError(op, "The finalized messages could not be loaded.")
  }
}
