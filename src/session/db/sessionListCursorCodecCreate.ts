import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { type SessionListCursor, sessionListCursorSchema } from "../api/sessionListCursorSchema.js"

export type SessionListCursorCodec = {
  decode: (cursor: string | undefined) => Result<SessionListCursor | undefined>
  encode: (cursor: SessionListCursor) => Result<string>
}

export function sessionListCursorCodecCreate(codec: JournalCursorCodec): Result<SessionListCursorCodec> {
  const op = "sessionListCursorCodecCreate"
  if (codec.encodePayload === undefined || codec.decodePayload === undefined)
    return createResultError(op, "The authenticated session list cursor codec is unavailable.")
  const encodePayload = codec.encodePayload
  const decodePayload = codec.decodePayload

  const encode = (cursor: SessionListCursor): Result<string> => {
    const parsed = v.safeParse(sessionListCursorSchema, cursor)
    if (!parsed.success) return createResultError(op, "The session list cursor is invalid.")
    const encoded = encodePayload(parsed.output)
    if (!encoded.success) return createResultError(op, encoded.errorMessage)
    return createResult(encoded.data)
  }

  const decode = (cursor: string | undefined): Result<SessionListCursor | undefined> => {
    if (cursor === undefined) return createResult(undefined)
    const decoded = decodePayload(cursor)
    if (!decoded.success) return createResultErrorCode(op, "The session list cursor is invalid.", "cursor_invalid")
    const payload = v.safeParse(v.object({ kind: v.literal("session-list") }), decoded.data)
    if (!payload.success) return createResultErrorCode(op, "The session list cursor is invalid.", "cursor_invalid")
    const parsed = v.safeParse(sessionListCursorSchema, decoded.data)
    if (!parsed.success) return createResultErrorCode(op, "The session list cursor is invalid.", "cursor_invalid")
    return createResult(parsed.output)
  }

  return createResult({ decode, encode })
}
