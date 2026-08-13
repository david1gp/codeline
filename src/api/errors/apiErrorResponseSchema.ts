import * as v from "valibot"

export const apiErrorResponseSchema = v.object({
  error: v.object({
    code: v.picklist([
      "bad_request",
      "conflict",
      "database_not_ready",
      "development_identity_unavailable",
      "internal_server_error",
      "not_found",
    ]),
    message: v.string(),
  }),
})

export type ApiErrorResponse = v.InferOutput<typeof apiErrorResponseSchema>
