import * as v from "valibot"
import { sessionShellSchema } from "./sessionShellSchema.js"

export const sessionCreateMutationResponseSchema = v.strictObject({
  created: v.boolean(),
  session: sessionShellSchema,
})

export type SessionCreateMutationResponse = v.InferOutput<typeof sessionCreateMutationResponseSchema>
