import * as v from "valibot"

export const streamApiErrorResponseSchema = v.strictObject({
  error: v.strictObject({
    code: v.picklist(["bad_request", "internal_server_error", "not_found", "stream_stale"]),
    message: v.string(),
  }),
})

export type StreamApiErrorResponse = v.InferOutput<typeof streamApiErrorResponseSchema>
