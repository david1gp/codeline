import * as v from "valibot"

const runDelegationResponseSchema = v.strictObject({
  childRunId: v.string(),
  delegationKey: v.string(),
  id: v.string(),
  parentAttemptId: v.string(),
  parentRunId: v.string(),
  task: v.string(),
})

export const runDelegationsResponseSchema = v.strictObject({
  delegations: v.array(runDelegationResponseSchema),
})

export type RunDelegationsResponse = v.InferOutput<typeof runDelegationsResponseSchema>
