import type { StreamEventRecord } from "./streamEventRecord.js"

export function streamEventDocumentPublic(document: StreamEventRecord): StreamEventRecord {
  return {
    createdAt: document.createdAt,
    eventType: document.eventType,
    id: document.id,
    idempotencyKey: document.idempotencyKey,
    payload: document.payload,
    sequence: document.sequence,
    sessionId: document.sessionId,
    streamId: document.streamId,
  }
}
