import * as v from "valibot"

export const sessionPinRequestSchema = v.strictObject({ pinned: v.boolean() })

export type SessionPinRequest = v.InferOutput<typeof sessionPinRequestSchema>
