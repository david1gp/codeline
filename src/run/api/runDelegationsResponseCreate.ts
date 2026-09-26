import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runDelegationsRepresentationEtagCreate } from "./runDelegationsRepresentationEtagCreate.js"
import { type RunDelegationsResponse, runDelegationsResponseSchema } from "./runDelegationsResponseSchema.js"
import { runDelegationsSchemaVersion } from "./runDelegationsSchemaVersion.js"

export function runDelegationsResponseCreate(input: {
  delegations: RunDelegationsResponse["delegations"]
  revision: number
  sessionId: string
}): Result<RunDelegationsResponse> {
  const op = "runDelegationsResponseCreate"
  const response = v.safeParse(runDelegationsResponseSchema, {
    delegations: input.delegations,
    etag: runDelegationsRepresentationEtagCreate(input.sessionId, input.revision),
    revision: input.revision,
    schemaVersion: runDelegationsSchemaVersion,
  })
  if (!response.success)
    return runResultCreateError(op, "The delegation representation is invalid.", runErrorCodes.delegationInvalid)
  return createResult(response.output)
}
