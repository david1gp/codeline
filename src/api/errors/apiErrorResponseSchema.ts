import * as v from "valibot"
import { apiPreconditionFailedResponseSchema } from "./apiPreconditionFailedResponseSchema.js"

const apiStandardErrorResponseSchema = v.strictObject({
  error: v.object({
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
    message: v.string(),
  }),
})

export const apiErrorResponseSchema = v.union([apiStandardErrorResponseSchema, apiPreconditionFailedResponseSchema])

export type ApiErrorResponse = v.InferOutput<typeof apiErrorResponseSchema>
