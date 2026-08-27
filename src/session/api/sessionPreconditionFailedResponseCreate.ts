import * as v from "valibot"
import { apiPreconditionFailedResponseCreate } from "../../api/conditional/apiPreconditionFailedResponseCreate.js"
import type { ApiPreconditionFailedResponse } from "../../api/errors/apiPreconditionFailedResponseSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

const sessionPreconditionDetailsSchema = v.strictObject({
  currentEtag: apiEtagSchema,
  currentRevision: apiRevisionSchema,
})

export function sessionPreconditionFailedResponseCreate(input: {
  errorData?: string | null
  message: string
  op: string
}): ApiPreconditionFailedResponse {
  let current: { currentEtag?: string; currentRevision?: number } = {}
  if (input.errorData !== undefined && input.errorData !== null) {
    const parsedJson = v.safeParse(v.pipe(v.string(), v.parseJson()), input.errorData)
    if (parsedJson.success) {
      const parsedDetails = v.safeParse(sessionPreconditionDetailsSchema, parsedJson.output)
      if (parsedDetails.success) current = parsedDetails.output
    }
  }

  return apiPreconditionFailedResponseCreate({
    ...(current.currentEtag === undefined ? {} : { currentEtag: current.currentEtag }),
    ...(current.currentRevision === undefined ? {} : { currentRevision: current.currentRevision }),
    message: input.message,
    op: input.op,
  })
}
