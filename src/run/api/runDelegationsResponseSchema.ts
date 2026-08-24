import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

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
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type RunDelegationsResponse = v.InferOutput<typeof runDelegationsResponseSchema>
