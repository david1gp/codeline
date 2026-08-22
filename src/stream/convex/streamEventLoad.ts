import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { streamEventDocumentPublic } from "./streamEventDocumentPublic.js"
import type { StreamEventRecord } from "./streamEventRecord.js"

type StreamQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function streamEventLoad(
  context: StreamQueryContext,
  userId: string,
  sessionId: string,
  streamId: string,
  eventId: string,
): Promise<Result<StreamEventRecord | undefined>> {
  const op = "streamEventLoad"
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const event = await context.db
      .query("streamEvents")
      .withIndex("id", (query: any) => query.eq("id", eventId))
      .first()
    if (event === null || event.sessionId !== sessionId || event.streamId !== streamId) return createResult(undefined)
    return createResult(streamEventDocumentPublic(event))
  } catch (_error) {
    return createResultError(op, "The stream event could not be loaded.")
  }
}
