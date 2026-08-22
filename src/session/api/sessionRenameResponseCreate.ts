import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { sessionDetailResponseCreate } from "./sessionDetailResponseCreate.js"
import { sessionRenameResponseSchema, type SessionRenameResponse } from "./sessionRenameResponseSchema.js"

export function sessionRenameResponseCreate(
  session: typeof import("../db/sessionTable.js").sessionTable.$inferSelect,
): Result<SessionRenameResponse> {
  const response = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    server: { id: session.serverId },
    session,
  })
  if (!response.success) return response
  const parsed = v.safeParse(sessionRenameResponseSchema, response.data)
  if (!parsed.success)
    return createResultError("sessionRenameResponseCreate", "The session rename response is invalid.")
  return createResult(parsed.output)
}
