import * as v from "valibot"

export const authSessionResponseSchema = v.object({
  authenticated: v.literal(true),
  userId: v.string(),
})

export type AuthSessionResponse = v.InferOutput<typeof authSessionResponseSchema>
