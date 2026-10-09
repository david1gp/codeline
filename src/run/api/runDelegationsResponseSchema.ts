import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"

const runDelegationResponseSchema = v.strictObject({
  /** True when the child was launched with background=true (async subagent). */
  background: v.boolean(),
  /** True once a parent continuation run has been admitted for the result. */
  continuationDelivered: v.boolean(),
  /** Child run's immutable target agent, so the UI never has to infer it from live feed rows. */
  childAgentId: v.optional(v.string()),
  childSessionId: v.nullable(apiPublicIdSchema),
  childRunId: v.string(),
  delegationId: v.string(),
  delegationKey: v.string(),
  finalizedResult: v.nullable(runDelegationResultSchema),
  id: v.string(),
  parentAttemptId: v.string(),
  parentRunId: v.string(),
  parentSessionId: apiPublicIdSchema,
  task: v.string(),
})

export const runDelegationsResponseSchema = v.strictObject({
  delegations: v.array(runDelegationResponseSchema),
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type RunDelegationsResponse = v.InferOutput<typeof runDelegationsResponseSchema>
