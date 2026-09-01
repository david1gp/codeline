import * as v from "valibot"
import { globalSummaryEventSchema } from "../schema/globalSummaryEventSchema.js"
import { streamSseFrameSerialize } from "./streamSseFrameSerialize.js"

const globalSummarySseSerializedEventMaximumBytes = 128 * 1024
const globalSummarySseEventTypeSchema = v.picklist([
  "input-needed",
  "invalidate",
  "reset",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
  "run-started",
])

export const globalSummarySseFrameSchema = v.pipe(
  v.strictObject({
    data: globalSummaryEventSchema,
    event: globalSummarySseEventTypeSchema,
    id: v.string(),
  }),
  v.check((frame) => frame.id === frame.data.id, "The global summary SSE frame ID must match its data ID."),
  v.check(
    (frame) => frame.event === frame.data.eventType,
    "The global summary SSE frame type must match its data event type.",
  ),
  v.check(
    (frame) =>
      new TextEncoder().encode(streamSseFrameSerialize(frame)).byteLength <=
      globalSummarySseSerializedEventMaximumBytes,
    "The serialized global summary SSE frame exceeds 128 KiB.",
  ),
)

export type GlobalSummarySseFrame = v.InferOutput<typeof globalSummarySseFrameSchema>
