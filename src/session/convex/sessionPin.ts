import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import { sessionOwnedDocumentLoad } from "./sessionOwnedDocumentLoad.js"
import type { SessionRecord } from "./sessionRecord.js"

type SessionMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function sessionPin(
  context: SessionMutationContext,
  userId: string,
  sessionId: string,
  pinned: boolean,
  organizationId: string,
): Promise<Result<SessionRecord>> {
  const op = "sessionPin"
  const loaded = await sessionOwnedDocumentLoad(context, userId, sessionId, organizationId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)
  if (loaded.data.document.archivedAt !== undefined && loaded.data.document.archivedAt !== null)
    return createResultError(op, "The session is archived.")

  try {
    const updatedAt = Date.now()
    await context.db.patch("sessions", loaded.data.document._id, { pinned, updatedAt })
    return createResult({ ...sessionDocumentPublic(loaded.data.document), pinned, updatedAt })
  } catch (_error) {
    return createResultError(op, "The session could not be pinned.")
  }
}
