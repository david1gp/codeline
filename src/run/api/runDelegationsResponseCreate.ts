import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
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
  if (!response.success) return createResultError(op, "The delegation representation is invalid.")
  return createResult(response.output)
}
