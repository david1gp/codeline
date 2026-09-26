import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { sessionHistoryEntryTable } from "../db/sessionHistoryEntryTable.js"
import type { SessionDetailSseFrame } from "./sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameSchema } from "./sessionDetailSseFrameSchema.js"

type SessionDetailSseFrameCreateDependencies = {
  cursorEncode: NonNullable<JournalCursorCodec["encodeSessionPosition"]>
}

type SessionDetailSseFrameEntry = typeof sessionHistoryEntryTable.$inferSelect

export function sessionDetailSseFrameCreate(
  dependencies: SessionDetailSseFrameCreateDependencies,
  entry: SessionDetailSseFrameEntry,
): Result<SessionDetailSseFrame> {
  const op = "sessionDetailSseFrameCreate"
  const encoded = dependencies.cursorEncode(entry.userId, entry.sessionId, entry.changePosition)
  if (!encoded.success) return createResultError(op, encoded.errorMessage)

  const frame = {
    data: {
      changePosition: entry.changePosition,
      entryId: entry.id,
      eventType: "entry" as const,
      id: encoded.data,
      kind: entry.kind,
      payload: entry.payload,
      position: entry.position,
      sessionId: entry.sessionId,
      sourceDetailId: entry.sourceDetailId,
      sourceId: entry.sourceId,
      sourceType: entry.sourceType,
    },
    event: "entry" as const,
    id: encoded.data,
  }
  const parsed = v.safeParse(sessionDetailSseFrameSchema, frame)
  if (!parsed.success) return createResultError(op, "The session history entry does not form a valid SSE frame.")
  return createResult(parsed.output)
}
