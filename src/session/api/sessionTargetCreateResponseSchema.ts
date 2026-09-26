import * as v from "valibot"

const sessionIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const sessionTargetCreateResponseSchema = v.object({
  created: v.boolean(),
  session: v.object({ id: sessionIdSchema }),
})

export type SessionTargetCreateResponse = v.InferOutput<typeof sessionTargetCreateResponseSchema>
