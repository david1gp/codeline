import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { GlobalSummarySseFrame } from "../../stream/api/globalSummarySseFrameSchema.js"
import { globalSummarySseFrameSchema } from "../../stream/api/globalSummarySseFrameSchema.js"
import type { journalEventTable } from "../db/journalEventTable.js"
import type { JournalJsonValue } from "../schema/journalJsonValueSchema.js"

type JournalGlobalSummaryEventFrameCreateDependencies = {
  cursorEncode: (journalId: unknown, globalSequence: unknown) => Result<string>
}

type JournalGlobalSummaryEventFrameInput = Pick<typeof journalEventTable.$inferSelect, "eventType" | "payload"> & {
  globalSequence?: number
  sequence?: number
}

const journalGlobalSummaryEventTypes = [
  "input-needed",
  "invalidate",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
  "run-started",
  "reset",
] as const

function journalGlobalSummaryPayloadObject(payload: JournalJsonValue): Record<string, JournalJsonValue> | undefined {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined
  return payload as Record<string, JournalJsonValue>
}

export function journalGlobalSummaryEventFrameCreate(
  dependencies: JournalGlobalSummaryEventFrameCreateDependencies,
  userId: string,
  event: JournalGlobalSummaryEventFrameInput,
): Result<GlobalSummarySseFrame> {
  const op = "journalGlobalSummaryEventFrameCreate"
  if (event.globalSequence !== undefined && event.sequence !== undefined && event.globalSequence !== event.sequence)
    return createResultError(op, "The global sequence fields disagree.")
  const globalSequence = event.globalSequence ?? event.sequence
  if (globalSequence === undefined || !Number.isSafeInteger(globalSequence) || globalSequence < 0)
    return createResultError(op, "The global sequence is invalid.")
  if (!journalGlobalSummaryEventTypes.includes(event.eventType as (typeof journalGlobalSummaryEventTypes)[number]))
    return createResultError(op, "The journal event is not permitted on the global summary stream.")

  const payload = journalGlobalSummaryPayloadObject(event.payload)
  if (payload === undefined) return createResultError(op, "The global summary payload is not an object.")

  const encoded = dependencies.cursorEncode(userId, globalSequence)
  if (!encoded.success) return createResultError(op, encoded.errorMessage)

  const frame = {
    data: {
      ...payload,
      eventType: event.eventType,
      globalSequence,
      id: encoded.data,
    },
    event: event.eventType,
    id: encoded.data,
  }
  const parsed = v.safeParse(globalSummarySseFrameSchema, frame)
  if (!parsed.success)
    return createResultErrorCode(
      op,
      "The journal event does not form a valid global summary SSE frame.",
      "global_summary_payload_invalid",
    )
  return createResult(parsed.output)
}
