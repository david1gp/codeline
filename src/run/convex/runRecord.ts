import type { RunBudget } from "../schema/runBudgetSchema.js"
import type { RunCancellationKind } from "../schema/runCancellationKindSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import type { RunStatus } from "../schema/runStatusSchema.js"

export type RunRecord = {
  budget: RunBudget
  cancellationKind: RunCancellationKind | null
  cancellationRequestedAt: number | null
  cancellationSourceRunId: string | null
  clientRunId: string
  createdAt: number
  deadlineAt: number
  failure: RunFailureMetadata | null
  finishedAt: number | null
  id: string
  sessionId: string
  snapshot: RunExecutionSnapshot
  startedAt: number | null
  status: RunStatus
  streamId: string
  updatedAt: number
  userId: string
}
