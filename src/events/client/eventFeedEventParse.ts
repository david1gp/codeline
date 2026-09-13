import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type GlobalSummarySseFrame, globalSummarySseFrameSchema } from "../api/globalSummarySseFrameSchema.js"

type EventFeedEventInput = {
  data?: unknown
  event?: unknown
  eventType?: unknown
  id?: unknown
  lastEventId?: unknown
  type?: unknown
}

function eventFeedEventError(message: string, errorData?: string) {
  const result = createResultErrorCode("eventFeedEventParse", message, "invalid_event")
  if (errorData !== undefined) result.errorData = errorData
  return result
}

export function eventFeedEventParse(input: unknown): Result<GlobalSummarySseFrame> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return eventFeedEventError("The SSE event is not an object.")
  }

  const candidate = input as EventFeedEventInput
  if (typeof candidate.data !== "string") return eventFeedEventError("The SSE event data must be a JSON string.")

  const event = candidate.event ?? candidate.eventType ?? candidate.type
  const id = candidate.id ?? candidate.lastEventId
  const json = v.safeParse(v.pipe(v.string(), v.parseJson()), candidate.data)
  if (!json.success) return eventFeedEventError("The SSE event data is not valid JSON.", v.summarize(json.issues))

  const frame = v.safeParse(globalSummarySseFrameSchema, { data: json.output, event, id })
  if (!frame.success)
    return eventFeedEventError("The SSE event does not match the shared event contract.", v.summarize(frame.issues))
  return createResult(frame.output)
}
