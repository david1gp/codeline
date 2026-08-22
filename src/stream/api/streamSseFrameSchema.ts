import * as v from "valibot"
import { journalEventIdSchema } from "../schema/journalEventIdSchema.js"
import { journalEventSchema } from "../schema/journalEventSchema.js"
import { streamSseFrameSerialize } from "./streamSseFrameSerialize.js"

const streamSseSerializedEventMaximumBytes = 128 * 1024
const streamSseEventTypeSchema = v.picklist([
  "delta",
  "invalidate",
  "reset",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
])
const streamSseFrameDataSchema = v.pipe(journalEventSchema)

export const streamSseFrameSchema = v.pipe(
  v.strictObject({
    data: streamSseFrameDataSchema,
    event: streamSseEventTypeSchema,
    id: journalEventIdSchema,
  }),
  v.check((frame) => frame.id === frame.data.id, "The SSE frame ID must match the journal event ID."),
  v.check((frame) => frame.event === frame.data.eventType, "The SSE frame type must match the journal event type."),
  v.check(
    (frame) =>
      new TextEncoder().encode(streamSseFrameSerialize(frame)).byteLength <= streamSseSerializedEventMaximumBytes,
    "The serialized SSE frame exceeds 128 KiB.",
  ),
)

export type StreamSseFrame = v.InferOutput<typeof streamSseFrameSchema>
