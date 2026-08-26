import * as v from "valibot"
import { apiPreconditionFailedResponseSchema } from "./apiPreconditionFailedResponseSchema.js"

const apiStandardErrorCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.check(
    (code) => code !== "precondition_failed",
    "The precondition_failed code uses its dedicated response contract.",
  ),
)

const apiStandardErrorResponseSchema = v.strictObject({
  error: v.strictObject({
    code: apiStandardErrorCodeSchema,
    details: v.optional(v.record(v.string(), v.unknown())),
    message: v.string(),
    op: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
    requestId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
    retryable: v.optional(v.boolean()),
    status: v.optional(v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(599))),
  }),
})

export const apiErrorResponseSchema = v.union([apiStandardErrorResponseSchema, apiPreconditionFailedResponseSchema])

export type ApiErrorResponse = v.InferOutput<typeof apiErrorResponseSchema>
