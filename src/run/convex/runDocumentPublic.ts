import type { RunRecord } from "./runRecord.js"

export function runDocumentPublic(
  document: Omit<
    RunRecord,
    "cancellationKind" | "cancellationRequestedAt" | "cancellationSourceRunId" | "failure" | "finishedAt" | "startedAt"
  > & {
    cancellationKind?: RunRecord["cancellationKind"]
    cancellationRequestedAt?: RunRecord["cancellationRequestedAt"]
    cancellationSourceRunId?: string
    failure?: RunRecord["failure"]
    finishedAt?: RunRecord["finishedAt"]
    startedAt?: RunRecord["startedAt"]
  },
): RunRecord {
  return {
    budget: document.budget,
    cancellationKind: document.cancellationKind ?? null,
    cancellationRequestedAt: document.cancellationRequestedAt ?? null,
    cancellationSourceRunId: document.cancellationSourceRunId ?? null,
    clientRunId: document.clientRunId,
    createdAt: document.createdAt,
    deadlineAt: document.deadlineAt,
    failure: document.failure ?? null,
    finishedAt: document.finishedAt ?? null,
    id: document.id,
    sessionId: document.sessionId,
    snapshot: document.snapshot,
    startedAt: document.startedAt ?? null,
    status: document.status,
    streamId: document.streamId,
    updatedAt: document.updatedAt,
    userId: document.userId,
  }
}
