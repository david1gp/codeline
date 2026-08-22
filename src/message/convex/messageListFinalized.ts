import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import * as v from "valibot"
import type { MessageRecord } from "./messageRecord.js"

type MessageQueryContext = Pick<GenericQueryCtx<any>, "db">
const messageCursorSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
type MessageCursor = v.InferOutput<typeof messageCursorSchema>

function messageCursorDecode(cursor: string | undefined): Result<MessageCursor | undefined> {
  const op = "messageCursorDecode"
  if (cursor === undefined) return createResult(undefined)
  try {
    const encoded = cursor.replaceAll("-", "+").replaceAll("_", "/")
    const decoded = JSON.parse(atob(encoded)) as unknown
    const parsed = v.safeParse(messageCursorSchema, decoded)
    return parsed.success ? createResult(parsed.output) : createResultError(op, "The message list cursor is invalid.")
  } catch (_error) {
    return createResultError(op, "The message list cursor is invalid.")
  }
}

function messageCursorEncode(cursor: MessageCursor): string {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

export async function messageListFinalized(
  context: MessageQueryContext,
  userId: string,
  sessionId: string,
  options: { cursor?: string; limit: number },
): Promise<Result<{ messages: MessageRecord[]; nextCursor: string | null }>> {
  const op = "messageListFinalized"
  const cursor = messageCursorDecode(options.cursor)
  if (!cursor.success) return cursor
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100)
    return createResultError(op, "The message list limit is invalid.")

  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const all = await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) => query.eq("sessionId", sessionId))
      .order("asc")
      .collect()
    const after = cursor.data
    const filtered = all.filter(
      (message: MessageRecord) =>
        (after === undefined ||
          message.sequence > after.sequence ||
          (message.sequence === after.sequence && message.id > after.id)) &&
        message.finalizedAt !== undefined,
    )
    const page = filtered.slice(0, options.limit) as MessageRecord[]
    const last = page[page.length - 1]
    const nextCursor =
      filtered.length > options.limit && last !== undefined
        ? messageCursorEncode({ id: last.id, sequence: last.sequence })
        : null
    return createResult({ messages: page, nextCursor })
  } catch (_error) {
    return createResultError(op, "The finalized messages could not be loaded.")
  }
}
