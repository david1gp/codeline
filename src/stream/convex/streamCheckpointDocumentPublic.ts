import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"

export function streamCheckpointDocumentPublic(document: StreamCheckpointRecord): StreamCheckpointRecord {
  return {
    id: document.id,
    lastSequence: document.lastSequence,
    sessionId: document.sessionId,
    streamId: document.streamId,
    updatedAt: document.updatedAt,
  }
}
