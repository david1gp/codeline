import type { RunDelegationRecord } from "./runDelegationRecord.js"

export function runDelegationDocumentPublic(
  document: Omit<RunDelegationRecord, "finalizedResult"> & {
    finalizedResult?: RunDelegationRecord["finalizedResult"]
  },
): RunDelegationRecord {
  return {
    childRunId: document.childRunId,
    createdAt: document.createdAt,
    delegationKey: document.delegationKey,
    depth: document.depth,
    finalizedResult: document.finalizedResult ?? null,
    id: document.id,
    parentAttemptId: document.parentAttemptId,
    parentRunId: document.parentRunId,
    rootOrdinal: document.rootOrdinal,
    rootRunId: document.rootRunId,
    sessionId: document.sessionId,
    task: document.task,
    updatedAt: document.updatedAt,
    userId: document.userId,
  }
}
