import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { streamCheckpointDocumentPublic } from "./streamCheckpointDocumentPublic.js"
import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"
import { streamEventDocumentPublic } from "./streamEventDocumentPublic.js"
import type { StreamEventRecord } from "./streamEventRecord.js"
import { streamJsonValueParse } from "./streamJsonValueParse.js"
import { streamJsonCanonicalize } from "./streamJsonCanonicalize.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function streamReplayAppend(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  input: { eventType: string; idempotencyKey: string; payload: unknown; sequence: number; streamId: string },
  inactivityTimeoutMs: number,
  now = Date.now(),
): Promise<Result<{ checkpoint: StreamCheckpointRecord; created: boolean; event: StreamEventRecord }>> {
  const op = "streamReplayAppend"
  if (!Number.isSafeInteger(inactivityTimeoutMs) || inactivityTimeoutMs <= 0)
    return createResultError(op, "The stream inactivity timeout must be a positive integer.")
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
    const rawCheckpoint = await context.db
      .query("streamCheckpoints")
      .withIndex("sessionIdStreamId", (query: any) => query.eq("sessionId", sessionId).eq("streamId", input.streamId))
      .first()
    const checkpointDocument = rawCheckpoint ?? {
      id: uuidv7(),
      lastSequence: 0,
      sessionId,
      streamId: input.streamId,
      updatedAt: now,
    }
    const checkpoint = streamCheckpointDocumentPublic(checkpointDocument)
    const idempotent = await context.db
      .query("streamEvents")
      .withIndex("streamIdIdempotencyKey", (query: any) =>
        query.eq("streamId", input.streamId).eq("idempotencyKey", input.idempotencyKey),
      )
      .first()
    if (idempotent !== null) {
      if (
        idempotent.sessionId === sessionId &&
        idempotent.sequence === input.sequence &&
        idempotent.eventType === input.eventType &&
        streamJsonCanonicalize(idempotent.payload) === streamJsonCanonicalize(payload.data)
      ) {
        if (idempotent.sequence === checkpoint.lastSequence + 1) {
          const repairedCheckpoint = { ...checkpointDocument, lastSequence: idempotent.sequence, updatedAt: now }
          if (rawCheckpoint === null) await context.db.insert("streamCheckpoints", repairedCheckpoint)
          else
            await context.db.patch("streamCheckpoints", rawCheckpoint._id, {
              lastSequence: idempotent.sequence,
              updatedAt: now,
            })
          return createResult({
            checkpoint: streamCheckpointDocumentPublic(repairedCheckpoint),
            created: false,
            event: streamEventDocumentPublic(idempotent),
          })
        }
        if (rawCheckpoint === null) await context.db.insert("streamCheckpoints", checkpointDocument)
        return createResult({ checkpoint, created: false, event: streamEventDocumentPublic(idempotent) })
      }
      return createResultError(op, "The stream event idempotency key conflicts with an existing event.")
    }
    if (session.archivedAt !== undefined) return createResultError(op, "The session is archived.")
    if (now - checkpoint.updatedAt >= inactivityTimeoutMs)
      return createResultErrorCode(op, "The stream is stale.", "stream_stale")
    if (input.sequence !== checkpoint.lastSequence + 1)
      return createResultError(op, "The stream event sequence must immediately follow the stream checkpoint.")
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
    if (rawCheckpoint === null) {
      await context.db.insert("streamCheckpoints", {
        ...checkpointDocument,
        lastSequence: input.sequence,
        updatedAt: now,
      })
    } else {
      await context.db.patch("streamCheckpoints", checkpointDocument._id, {
        lastSequence: input.sequence,
        updatedAt: now,
      })
    }
    return createResult({
      checkpoint: { ...checkpoint, lastSequence: input.sequence, updatedAt: now },
      created: true,
      event: event as StreamEventRecord,
    })
  } catch (_error) {
    return createResultError(op, "The stream event could not be appended.")
  }
}
