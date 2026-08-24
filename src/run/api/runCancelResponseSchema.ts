import * as v from "valibot"

export const runCancelResponseSchema = v.object({
  cancelledRunIds: v.array(v.string()),
  signalledRunIds: v.array(v.string()),
})

export type RunCancelResponse = v.InferOutput<typeof runCancelResponseSchema>
