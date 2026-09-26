import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { type MessageListCursor, messageListCursorSchema } from "../api/messageListCursorSchema.js"

type MessageListCursorCodec = {
  decode: (cursor: string | undefined) => Result<MessageListCursor | undefined>
  encode: (cursor: MessageListCursor) => string
}

function messageListCursorCanonicalEncode(cursor: MessageListCursor): string {
  const payload = JSON.stringify({ version: 1, sessionId: cursor.sessionId, sequence: cursor.sequence, id: cursor.id })
  return Buffer.from(payload, "utf8").toString("base64url")
}

function messageListCursorDecode(cursor: string | undefined): Result<MessageListCursor | undefined> {
  const op = "messageListCursorDecode"
  if (cursor === undefined) return createResult(undefined)

  const cursorParsed = v.safeParse(apiCursorSchema, cursor)
  if (!cursorParsed.success) return createResultError(op, "The message list cursor is invalid.")

  try {
    const decoded = Buffer.from(cursor, "base64url")
    if (decoded.length === 0 || decoded.toString("base64url") !== cursor)
      return createResultError(op, "The message list cursor is invalid.")

    const payload = decoded.toString("utf8")
    const parsed = v.safeParse(messageListCursorSchema, JSON.parse(payload) as unknown)
    if (!parsed.success || messageListCursorCanonicalEncode(parsed.output) !== cursor)
      return createResultError(op, "The message list cursor is invalid.")
    return createResult(parsed.output)
  } catch (_error) {
    return createResultError(op, "The message list cursor is invalid.")
  }
}

export function messageListCursorCodecCreate(): MessageListCursorCodec {
  return {
    decode: messageListCursorDecode,
    encode: messageListCursorCanonicalEncode,
  }
}
