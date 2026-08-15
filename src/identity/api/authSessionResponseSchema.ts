import * as v from "valibot"

export const authSessionResponseSchema = v.object({
  authenticated: v.literal(true),
  displayName: v.string(),
  userId: v.string(),
})

export type AuthSessionResponse = v.InferOutput<typeof authSessionResponseSchema>
