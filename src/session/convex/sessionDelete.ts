import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import { sessionOwnedDocumentLoad } from "./sessionOwnedDocumentLoad.js"
import type { SessionRecord } from "./sessionRecord.js"

type SessionMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function sessionDelete(
  context: SessionMutationContext,
  userId: string,
  sessionId: string,
  organizationId: string,
): Promise<Result<SessionRecord>> {
  const op = "sessionDelete"
  const loaded = await sessionOwnedDocumentLoad(context, userId, sessionId, organizationId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)

  try {
    await context.db.delete("sessions", loaded.data.document._id)
    return createResult(sessionDocumentPublic(loaded.data.document))
  } catch (_error) {
    return createResultError(op, "The session could not be deleted.")
  }
}
