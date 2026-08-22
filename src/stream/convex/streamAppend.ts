import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { streamEventDocumentPublic } from "./streamEventDocumentPublic.js"
import type { StreamEventRecord } from "./streamEventRecord.js"
import { streamJsonValueParse } from "./streamJsonValueParse.js"
import { streamJsonCanonicalize } from "./streamJsonCanonicalize.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

function streamEventMatches(
  event: StreamEventRecord,
  input: { eventType: string; payload: unknown; sequence: number; streamId: string },
): boolean {
  return (
    event.streamId === input.streamId &&
    event.sequence === input.sequence &&
    event.eventType === input.eventType &&
    streamJsonCanonicalize(event.payload) === streamJsonCanonicalize(input.payload)
  )
}

export async function streamAppend(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  input: { eventType: string; idempotencyKey: string; payload: unknown; sequence: number; streamId: string },
  now = Date.now(),
): Promise<Result<{ created: boolean; event: StreamEventRecord }>> {
  const op = "streamAppend"
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0)
    return createResultError(op, "The stream event sequence must be a positive integer.")
  if (input.streamId.length === 0 || input.eventType.length === 0 || input.idempotencyKey.length === 0)
    return createResultError(op, "The stream event identifiers and type are required.")
  const payload = streamJsonValueParse(input.payload)
  if (!payload.success) return payload
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const idempotent = await context.db
      .query("streamEvents")
      .withIndex("streamIdIdempotencyKey", (query: any) =>
        query.eq("streamId", input.streamId).eq("idempotencyKey", input.idempotencyKey),
      )
      .first()
    if (idempotent !== null) {
      if (idempotent.sessionId === sessionId && streamEventMatches(idempotent, { ...input, payload: payload.data }))
        return createResult({ created: false, event: streamEventDocumentPublic(idempotent) })
      return createResultError(op, "The stream event idempotency key conflicts with an existing event.")
    }
    if (session.archivedAt !== undefined) return createResultError(op, "The session is archived.")
    const sequenced = await context.db
      .query("streamEvents")
      .withIndex("streamIdSequence", (query: any) =>
        query.eq("streamId", input.streamId).eq("sequence", input.sequence),
      )
      .first()
    if (sequenced !== null) return createResultError(op, "The stream event sequence conflicts with an existing event.")
    const event = {
      createdAt: now,
      eventType: input.eventType,
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      payload: payload.data,
      sequence: input.sequence,
      sessionId,
      streamId: input.streamId,
    }
    await context.db.insert("streamEvents", event)
    return createResult({ created: true, event: event as StreamEventRecord })
  } catch (_error) {
    return createResultError(op, "The stream event could not be appended.")
  }
}
