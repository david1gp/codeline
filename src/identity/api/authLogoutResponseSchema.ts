import * as v from "valibot"

export const authLogoutResponseSchema = v.object({
  loggedOut: v.literal(true),
})

export type AuthLogoutResponse = v.InferOutput<typeof authLogoutResponseSchema>
