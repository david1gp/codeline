import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"

type StreamQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function streamLatestEvent(
  context: StreamQueryContext,
  userId: string,
  sessionId: string,
  streamId: string,
  lastSequence: number,
): Promise<Result<{ id: string } | undefined>> {
  const op = "streamLatestEvent"
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const event = await context.db
      .query("streamEvents")
      .withIndex("sessionIdStreamIdSequence", (query: any) =>
        query.eq("sessionId", sessionId).eq("streamId", streamId).lte("sequence", lastSequence),
      )
      .order("desc")
      .first()
    return createResult(event === null ? undefined : { id: event.id })
  } catch (_error) {
    return createResultError(op, "The latest stream event could not be loaded.")
  }
}
