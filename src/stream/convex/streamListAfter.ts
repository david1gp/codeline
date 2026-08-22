import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { streamEventDocumentPublic } from "./streamEventDocumentPublic.js"
import type { StreamEventRecord } from "./streamEventRecord.js"

type StreamQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function streamListAfter(
  context: StreamQueryContext,
  userId: string,
  sessionId: string,
  streamId: string,
  options: { afterSequence: number; limit: number },
): Promise<Result<StreamEventRecord[]>> {
  const op = "streamListAfter"
  if (!Number.isSafeInteger(options.afterSequence) || options.afterSequence < 0)
    return createResultError(op, "The stream event cursor must be a nonnegative integer.")
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100)
    return createResultError(op, "The stream event limit must be between 1 and 100.")
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const events = await context.db
      .query("streamEvents")
      .withIndex("sessionIdStreamIdSequence", (query: any) =>
        query.eq("sessionId", sessionId).eq("streamId", streamId).gt("sequence", options.afterSequence),
      )
      .order("asc")
      .take(options.limit)
    return createResult(events.map(streamEventDocumentPublic))
  } catch (_error) {
    return createResultError(op, "The stream events could not be loaded.")
  }
}
