import * as v from "valibot"

export const sessionWatchRequestSchema = v.strictObject({ watched: v.boolean() })

export type SessionWatchRequest = v.InferOutput<typeof sessionWatchRequestSchema>
