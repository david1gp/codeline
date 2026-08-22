import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type StreamSseFrame, streamSseFrameSchema } from "../../stream/api/streamSseFrameSchema.js"
import type { journalEventTable } from "../db/journalEventTable.js"
import type { JournalJsonValue } from "../schema/journalJsonValueSchema.js"

type JournalBacklogEventFrameCreateDependencies = {
  cursorEncode: (journalId: unknown, sequence: unknown) => Result<string>
}

type JournalBacklogEventFrameInput = Pick<typeof journalEventTable.$inferSelect, "eventType" | "payload" | "sequence">

function journalBacklogPayloadObject(payload: JournalJsonValue): Record<string, JournalJsonValue> | undefined {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined
  return payload as Record<string, JournalJsonValue>
}

export function journalBacklogEventFrameCreate(
  dependencies: JournalBacklogEventFrameCreateDependencies,
  journalId: string,
  event: JournalBacklogEventFrameInput,
): Result<StreamSseFrame> {
  const op = "journalBacklogEventFrameCreate"
  const payload = journalBacklogPayloadObject(event.payload)
  if (payload === undefined) return createResultError(op, "The journal event payload is not an object.")

  const encoded = dependencies.cursorEncode(journalId, event.sequence)
  if (!encoded.success) return createResultError(op, encoded.errorMessage)

  const frame = {
    data: {
      ...payload,
      eventType: event.eventType,
      id: encoded.data,
      sequence: event.sequence,
    },
    event: event.eventType,
    id: encoded.data,
  }
  const parsed = v.safeParse(streamSseFrameSchema, frame)
  if (!parsed.success) return createResultError(op, "The journal event does not form a valid SSE frame.")
  return createResult(parsed.output)
}
