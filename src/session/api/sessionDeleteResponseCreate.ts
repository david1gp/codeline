import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type SessionDeleteResponse, sessionDeleteResponseSchema } from "./sessionDeleteResponseSchema.js"

export function sessionDeleteResponseCreate(input: { id: string; revision: number }): Result<SessionDeleteResponse> {
  const parsed = v.safeParse(sessionDeleteResponseSchema, {
    deleted: true,
    session: { id: input.id, revision: input.revision },
  })
  if (!parsed.success)
    return createResultError("sessionDeleteResponseCreate", "The session delete response is invalid.")
  return createResult(parsed.output)
}
