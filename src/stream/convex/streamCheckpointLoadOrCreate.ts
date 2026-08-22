import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { streamCheckpointDocumentPublic } from "./streamCheckpointDocumentPublic.js"
import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function streamCheckpointLoadOrCreate(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  streamId: string,
  now = Date.now(),
): Promise<Result<{ created: boolean; checkpoint: StreamCheckpointRecord }>> {
  const op = "streamCheckpointLoadOrCreate"
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const existing = await context.db
      .query("streamCheckpoints")
      .withIndex("sessionIdStreamId", (query: any) => query.eq("sessionId", sessionId).eq("streamId", streamId))
      .first()
    if (existing !== null) return createResult({ created: false, checkpoint: streamCheckpointDocumentPublic(existing) })
    if (session.archivedAt !== undefined) return createResultError(op, "The session is archived.")
    const checkpoint = { id: uuidv7(), lastSequence: 0, sessionId, streamId, updatedAt: now }
    await context.db.insert("streamCheckpoints", checkpoint)
    return createResult({ created: true, checkpoint })
  } catch (_error) {
    return createResultError(op, "The stream checkpoint could not be loaded.")
  }
}
