import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type SessionCreateMutationResponse,
  sessionCreateMutationResponseSchema,
} from "./sessionCreateMutationResponseSchema.js"
import { sessionShellCreate } from "./sessionShellCreate.js"

export function sessionCreateMutationResponseCreate(input: {
  created: boolean
  session: Parameters<typeof sessionShellCreate>[0]
}): Result<SessionCreateMutationResponse> {
  const op = "sessionCreateMutationResponseCreate"
  const session = sessionShellCreate(input.session)
  if (!session.success) return session
  const parsed = v.safeParse(sessionCreateMutationResponseSchema, { created: input.created, session: session.data })
  if (!parsed.success) return createResultError(op, "The session mutation response is invalid.")
  return createResult(parsed.output)
}
