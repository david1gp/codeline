import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import type { SessionListRow } from "./sessionListRow.js"
import { sessionOwnedDocumentLoad } from "./sessionOwnedDocumentLoad.js"

type SessionQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function sessionLoad(
  context: SessionQueryContext,
  userId: string,
  sessionId: string,
  organizationId: string,
): Promise<Result<SessionListRow>> {
  const op = "sessionLoad"
  const loaded = await sessionOwnedDocumentLoad(context, userId, sessionId, organizationId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)
  return createResult({
    agent: loaded.data.agent,
    server: loaded.data.server,
    session: loaded.data.document,
  })
}
