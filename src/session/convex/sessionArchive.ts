import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import { sessionOwnedDocumentLoad } from "./sessionOwnedDocumentLoad.js"
import type { SessionRecord } from "./sessionRecord.js"

type SessionMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function sessionArchive(
  context: SessionMutationContext,
  userId: string,
  sessionId: string,
  organizationId: string,
): Promise<Result<SessionRecord>> {
  const op = "sessionArchive"
  const loaded = await sessionOwnedDocumentLoad(context, userId, sessionId, organizationId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)

  try {
    if (loaded.data.document.archivedAt !== undefined && loaded.data.document.archivedAt !== null)
      return createResult(sessionDocumentPublic(loaded.data.document))
    const archivedAt = Date.now()
    await context.db.patch("sessions", loaded.data.document._id, { archivedAt, updatedAt: archivedAt })
    return createResult({ ...sessionDocumentPublic(loaded.data.document), archivedAt, updatedAt: archivedAt })
  } catch (_error) {
    return createResultError(op, "The session could not be archived.")
  }
}
