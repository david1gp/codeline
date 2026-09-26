import * as v from "valibot"

export const runCancelInputSchema = v.strictObject({
  kind: v.optional(v.literal("requested"), "requested"),
})

export type RunCancelInput = v.InferInput<typeof runCancelInputSchema>
