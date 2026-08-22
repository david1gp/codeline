import type { AttemptRecord } from "./attemptRecord.js"

export function attemptDocumentPublic(
  document: Omit<AttemptRecord, "failure" | "finishedAt" | "startedAt"> & {
    failure?: AttemptRecord["failure"]
    finishedAt?: AttemptRecord["finishedAt"]
    startedAt?: AttemptRecord["startedAt"]
  },
): AttemptRecord {
  return {
    budget: document.budget,
    createdAt: document.createdAt,
    failure: document.failure ?? null,
    finishedAt: document.finishedAt ?? null,
    id: document.id,
    ordinal: document.ordinal,
    runId: document.runId,
    sessionId: document.sessionId,
    snapshot: document.snapshot,
    startedAt: document.startedAt ?? null,
    status: document.status,
    streamId: document.streamId,
    updatedAt: document.updatedAt,
    userId: document.userId,
  }
}
