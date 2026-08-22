import * as v from "valibot"
import { apiEtagSchema } from "../schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../schema/apiRevisionSchema.js"

export const apiPreconditionFailedResponseSchema = v.strictObject({
  error: v.strictObject({
    code: v.literal("precondition_failed"),
    currentEtag: v.optional(apiEtagSchema),
    currentRevision: v.optional(apiRevisionSchema),
    message: v.string(),
    op: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    retryable: v.literal(false),
    status: v.literal(412),
  }),
})

export type ApiPreconditionFailedResponse = v.InferOutput<typeof apiPreconditionFailedResponseSchema>
