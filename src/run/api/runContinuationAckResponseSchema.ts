import * as v from "valibot"

export const runContinuationAckResponseSchema = v.object({
  alreadyDelivered: v.boolean(),
  delegationId: v.string(),
  delivered: v.boolean(),
})

export type RunContinuationAckResponse = v.InferOutput<typeof runContinuationAckResponseSchema>
