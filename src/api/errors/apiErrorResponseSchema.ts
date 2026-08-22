import * as v from "valibot"
import { apiPreconditionFailedResponseSchema } from "./apiPreconditionFailedResponseSchema.js"

const apiStandardErrorResponseSchema = v.strictObject({
  error: v.strictObject({
    code: v.picklist([
      "bad_request",
      "conflict",
      "database_not_ready",
      "development_identity_unavailable",
      "forbidden",
      "internal_server_error",
      "not_found",
      "unauthorized",
    ]),
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
