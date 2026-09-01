import { createResultError, type Result } from "@adaptive-ds/result"
import type { JournalCursorCodec } from "./journalCursorCodecCreate.js"

export function journalSessionCursorEncode(
  cursorCodec: Pick<JournalCursorCodec, "encodeSessionPosition">,
  userId: unknown,
  sessionId: unknown,
  changePosition: unknown,
): Result<string> {
  const encode = cursorCodec.encodeSessionPosition
  if (encode === undefined)
    return createResultError("journalSessionCursorEncode", "The session cursor could not be encoded.")
  return encode(userId, sessionId, changePosition)
}
