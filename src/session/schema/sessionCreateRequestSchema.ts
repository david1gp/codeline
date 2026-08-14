import * as v from "valibot"

export const sessionCreateRequestSchema = v.strictObject({
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  metadata: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(500))), {}),
  primaryAgentId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  serverId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
})

export type SessionCreateRequest = v.InferOutput<typeof sessionCreateRequestSchema>
