import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SessionDetailSseFrame } from "../api/sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameSchema } from "../api/sessionDetailSseFrameSchema.js"

type SessionDetailEventInput = {
  data?: unknown
  event?: unknown
  eventType?: unknown
  id?: unknown
  lastEventId?: unknown
  type?: unknown
}

export function sessionDetailEventParse(input: unknown): Result<SessionDetailSseFrame> {
  const op = "sessionDetailEventParse"
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return createResultError(op, "The selected-session SSE event is not an object.")

  const candidate = input as SessionDetailEventInput
  if (typeof candidate.data !== "string")
    return createResultError(op, "The selected-session SSE event data must be JSON.")
  const data = v.safeParse(v.pipe(v.string(), v.parseJson()), candidate.data)
  if (!data.success) return createResultError(op, "The selected-session SSE event data is invalid.")

  const parsed = v.safeParse(sessionDetailSseFrameSchema, {
    data: data.output,
    event: candidate.event ?? candidate.eventType ?? candidate.type,
    id: candidate.id ?? candidate.lastEventId,
  })
  if (!parsed.success) return createResultError(op, "The selected-session SSE event does not match its contract.")
  return createResult(parsed.output)
}
