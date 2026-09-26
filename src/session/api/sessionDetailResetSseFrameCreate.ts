import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { SessionDetailSseFrame } from "./sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameSchema } from "./sessionDetailSseFrameSchema.js"

type SessionDetailResetSseFrameCreateDependencies = {
  cursorEncode: NonNullable<JournalCursorCodec["encodeSessionPosition"]>
}

export function sessionDetailResetSseFrameCreate(
  dependencies: SessionDetailResetSseFrameCreateDependencies,
  input: {
    asOfPosition: number
    reason: "cursor-expired" | "cursor-invalid" | "session-unavailable"
    sessionId: string
    userId: string
  },
): Result<SessionDetailSseFrame> {
  const op = "sessionDetailResetSseFrameCreate"
  const encoded = dependencies.cursorEncode(input.userId, input.sessionId, input.asOfPosition)
  if (!encoded.success) return createResultError(op, encoded.errorMessage)
  const frame = {
    data: {
      asOfPosition: input.asOfPosition,
      eventType: "reset" as const,
      id: encoded.data,
      reason: input.reason,
      sessionId: input.sessionId,
    },
    event: "reset" as const,
    id: encoded.data,
  }
  const parsed = v.safeParse(sessionDetailSseFrameSchema, frame)
  if (!parsed.success) return createResultError(op, "The selected-session reset does not form a valid SSE frame.")
  return createResult(parsed.output)
}
