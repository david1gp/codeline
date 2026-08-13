import * as v from "valibot"

export const streamApiStatusResponseSchema = v.strictObject({
  lastEventId: v.nullable(v.string()),
  lastSequence: v.number(),
  stale: v.boolean(),
  streamId: v.string(),
})

export type StreamApiStatusResponse = v.InferOutput<typeof streamApiStatusResponseSchema>
