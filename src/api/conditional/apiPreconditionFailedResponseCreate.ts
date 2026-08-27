import type { ApiPreconditionFailedResponse } from "../errors/apiPreconditionFailedResponseSchema.js"
import type { ApiEtag } from "../schema/apiEtagSchema.js"
import type { ApiRevision } from "../schema/apiRevisionSchema.js"

export function apiPreconditionFailedResponseCreate(input: {
  currentEtag?: ApiEtag
  currentRevision?: ApiRevision
  message: string
  op: string
}): ApiPreconditionFailedResponse {
  return {
    error: {
      code: "precondition_failed",
      ...(input.currentEtag === undefined ? {} : { currentEtag: input.currentEtag }),
      ...(input.currentRevision === undefined ? {} : { currentRevision: input.currentRevision }),
      message: input.message,
      op: input.op,
      retryable: false,
      status: 412,
    },
  }
}
