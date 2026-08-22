import type { RunDelegationResult } from "../schema/runDelegationResultSchema.js"

export type RunDelegationRecord = {
  childRunId: string
  createdAt: number
  delegationKey: string
  depth: number
  finalizedResult: RunDelegationResult | null
  id: string
  parentAttemptId: string
  parentRunId: string
  rootOrdinal: number
  rootRunId: string
  sessionId: string
  task: string
  updatedAt: number
  userId: string
}
