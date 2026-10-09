import * as v from "valibot"

export const runCancelResponseSchema = v.object({
  cancelledRunIds: v.array(v.string()),
  signalledRunIds: v.array(v.string()),
  /** True when the stop was deferred to the next safe tool boundary. */
  deferred: v.optional(v.boolean()),
})

export type RunCancelResponse = v.InferOutput<typeof runCancelResponseSchema>
