import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import { sessionOwnedDocumentLoad } from "./sessionOwnedDocumentLoad.js"
import type { SessionRecord } from "./sessionRecord.js"

type SessionMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function sessionUpdate(
  context: SessionMutationContext,
  userId: string,
  sessionId: string,
  input: unknown,
  organizationId: string,
): Promise<Result<SessionRecord>> {
  const op = "sessionUpdate"
  const parsed = v.safeParse(sessionRenameRequestSchema, input)
  if (!parsed.success) return createResultError(op, "The session update input is invalid.")
  const loaded = await sessionOwnedDocumentLoad(context, userId, sessionId, organizationId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)
  if (loaded.data.document.archivedAt !== undefined && loaded.data.document.archivedAt !== null)
    return createResultError(op, "The session is archived.")

  try {
    const updatedAt = Date.now()
    await context.db.patch("sessions", loaded.data.document._id, { title: parsed.output.title, updatedAt })
    return createResult({ ...sessionDocumentPublic(loaded.data.document), title: parsed.output.title, updatedAt })
  } catch (_error) {
    return createResultError(op, "The session could not be updated.")
  }
}
