import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { streamCheckpointDocumentPublic } from "./streamCheckpointDocumentPublic.js"
import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"
import { streamEventDocumentPublic } from "./streamEventDocumentPublic.js"
import type { StreamEventRecord } from "./streamEventRecord.js"
import { streamReplayStart } from "./streamReplayStart.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function streamReplay(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  streamId: string,
  input: { afterSequence?: number; inactivityTimeoutMs: number; limit?: number },
  now = Date.now(),
): Promise<Result<{ checkpoint: StreamCheckpointRecord; events: StreamEventRecord[]; stale: boolean }>> {
  const op = "streamReplay"
  const afterSequence = input.afterSequence ?? 0
  const limit = input.limit ?? 100
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
    return createResultError(op, "The stream event cursor must be a nonnegative integer.")
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return createResultError(op, "The stream event limit must be between 1 and 100.")
  if (!Number.isSafeInteger(input.inactivityTimeoutMs) || input.inactivityTimeoutMs <= 0)
    return createResultError(op, "The stream inactivity timeout must be a positive integer.")
  const started = await streamReplayStart(context, userId, sessionId, streamId, now)
  if (!started.success) return createResultError(op, started.errorMessage)
  try {
    const events = await context.db
      .query("streamEvents")
      .withIndex("sessionIdStreamIdSequence", (query: any) =>
        query.eq("sessionId", sessionId).eq("streamId", streamId).gt("sequence", afterSequence),
      )
      .order("asc")
      .collect()
    const checkpoint = started.data.checkpoint
    return createResult({
      checkpoint,
      events: events
        .filter((event: StreamEventRecord) => event.sequence <= checkpoint.lastSequence)
        .slice(0, limit)
        .map(streamEventDocumentPublic),
      stale: now - checkpoint.updatedAt >= input.inactivityTimeoutMs,
    })
  } catch (_error) {
    return createResultError(op, "The stream events could not be loaded.")
  }
}
