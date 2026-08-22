import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { streamCheckpointDocumentPublic } from "./streamCheckpointDocumentPublic.js"
import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function streamCheckpointAdvance(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  streamId: string,
  lastSequence: number,
  now = Date.now(),
): Promise<Result<{ advanced: boolean; checkpoint: StreamCheckpointRecord }>> {
  const op = "streamCheckpointAdvance"
  if (!Number.isSafeInteger(lastSequence) || lastSequence < 0)
    return createResultError(op, "The checkpoint sequence must be a nonnegative integer.")
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const rawCheckpoint = await context.db
      .query("streamCheckpoints")
      .withIndex("sessionIdStreamId", (query: any) => query.eq("sessionId", sessionId).eq("streamId", streamId))
      .first()
    if (rawCheckpoint === null) return createResultError(op, "The stream checkpoint could not be found.")
    const checkpoint = streamCheckpointDocumentPublic(rawCheckpoint)
    if (session.archivedAt !== undefined) return createResultError(op, "The session is archived.")
    if (lastSequence <= checkpoint.lastSequence) return createResult({ advanced: false, checkpoint })
    const updated = { ...rawCheckpoint, lastSequence, updatedAt: now }
    await context.db.patch("streamCheckpoints", rawCheckpoint._id, { lastSequence, updatedAt: now })
    return createResult({ advanced: true, checkpoint: streamCheckpointDocumentPublic(updated) })
  } catch (_error) {
    return createResultError(op, "The stream checkpoint could not be advanced.")
  }
}
