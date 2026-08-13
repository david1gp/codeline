import * as v from "valibot"

export const streamApiReplayQuerySchema = v.strictObject({
  afterEventId: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  limit: v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(100)),
    "100",
  ),
})

export type StreamApiReplayQuery = v.InferOutput<typeof streamApiReplayQuerySchema>
