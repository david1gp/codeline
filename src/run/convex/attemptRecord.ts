import type { RunBudget } from "../schema/runBudgetSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import type { AttemptStatus } from "../schema/attemptStatusSchema.js"

export type AttemptRecord = {
  budget: RunBudget
  createdAt: number
  failure: RunFailureMetadata | null
  finishedAt: number | null
  id: string
  ordinal: number
  runId: string
  sessionId: string
  snapshot: RunExecutionSnapshot
  startedAt: number | null
  status: AttemptStatus
  streamId: string
  updatedAt: number
  userId: string
}
