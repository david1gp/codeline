import * as v from "valibot"

const sessionTargetIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const sessionTargetLoadResponseSchema = v.object({
  session: v.object({
    primaryAgentId: sessionTargetIdSchema,
    serverId: sessionTargetIdSchema,
  }),
})

export type SessionTargetLoadResponse = v.InferOutput<typeof sessionTargetLoadResponseSchema>
