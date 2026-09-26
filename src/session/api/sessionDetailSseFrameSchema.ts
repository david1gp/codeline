import * as v from "valibot"
import { sessionDetailEventSchema } from "./sessionDetailEventSchema.js"
import { streamSseFrameSerialize } from "../../stream/api/streamSseFrameSerialize.js"

const sessionDetailSseSerializedEventMaximumBytes = 128 * 1024

export const sessionDetailSseFrameSchema = v.pipe(
  v.strictObject({
    data: sessionDetailEventSchema,
    event: v.picklist(["entry", "reset"]),
    id: v.string(),
  }),
  v.check((frame) => frame.id === frame.data.id, "The selected-session SSE frame ID must match its data ID."),
  v.check(
    (frame) => frame.event === frame.data.eventType,
    "The selected-session SSE frame type must match its data type.",
  ),
  v.check(
    (frame) =>
      new TextEncoder().encode(streamSseFrameSerialize(frame)).byteLength <=
      sessionDetailSseSerializedEventMaximumBytes,
    "The serialized selected-session SSE frame exceeds 128 KiB.",
  ),
)

export type SessionDetailSseFrame = v.InferOutput<typeof sessionDetailSseFrameSchema>
