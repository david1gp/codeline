import { defineTable } from "convex/server"
import { v } from "convex/values"
import { attemptStatusValidator } from "./attemptStatusValidator.js"
import { runBudgetValidator } from "./runBudgetValidator.js"
import { runCancellationKindValidator } from "./runCancellationKindValidator.js"
import { runDelegationResultValidator } from "./runDelegationResultValidator.js"
import { runExecutionSnapshotValidator } from "./runExecutionSnapshotValidator.js"
import { runFailureMetadataValidator } from "./runFailureMetadataValidator.js"
import { runStatusValidator } from "./runStatusValidator.js"

const runFields = {
  id: v.string(),
  userId: v.string(),
  sessionId: v.string(),
  clientRunId: v.string(),
  streamId: v.string(),
  status: runStatusValidator,
  snapshot: runExecutionSnapshotValidator,
  budget: runBudgetValidator,
  deadlineAt: v.number(),
  failure: v.optional(runFailureMetadataValidator),
  cancellationRequestedAt: v.optional(v.number()),
  cancellationKind: v.optional(runCancellationKindValidator),
  cancellationSourceRunId: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
} as const

const attemptFields = {
  id: v.string(),
  runId: v.string(),
  userId: v.string(),
  sessionId: v.string(),
  ordinal: v.number(),
  streamId: v.string(),
  status: attemptStatusValidator,
  snapshot: runExecutionSnapshotValidator,
  budget: runBudgetValidator,
  failure: v.optional(runFailureMetadataValidator),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
} as const

const runDelegationFields = {
  id: v.string(),
  userId: v.string(),
  sessionId: v.string(),
  childRunId: v.string(),
  rootRunId: v.string(),
  parentRunId: v.string(),
  parentAttemptId: v.string(),
  delegationKey: v.string(),
  rootOrdinal: v.number(),
  depth: v.number(),
  task: v.string(),
  finalizedResult: v.optional(runDelegationResultValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
} as const

export const runTables = {
  runs: defineTable(runFields)
    .index("id", ["id"])
    .index("sessionIdClientRunId", ["sessionId", "clientRunId"])
    .index("streamId", ["streamId"])
    .index("userIdSessionIdId", ["userId", "sessionId", "id"])
    .index("userIdUpdatedAtId", ["userId", "updatedAt", "id"])
    .index("sessionIdUpdatedAtId", ["sessionId", "updatedAt", "id"])
    .index("sessionId", ["sessionId"])
    .index("cancellationSource", ["userId", "sessionId", "cancellationSourceRunId"]),

  attempts: defineTable(attemptFields)
    .index("id", ["id"])
    .index("runIdOrdinal", ["runId", "ordinal"])
    .index("streamId", ["streamId"])
    .index("userIdSessionIdRunIdId", ["userId", "sessionId", "runId", "id"])
    .index("sessionIdUpdatedAtId", ["sessionId", "updatedAt", "id"])
    .index("sessionId", ["sessionId"]),

  runDelegations: defineTable(runDelegationFields)
    .index("id", ["id"])
    .index("childRunId", ["childRunId"])
    .index("parentKey", ["parentRunId", "parentAttemptId", "delegationKey"])
    .index("rootOrdinal", ["rootRunId", "rootOrdinal"])
    .index("userIdUpdatedAtId", ["userId", "updatedAt", "id"])
    .index("sessionIdUpdatedAtId", ["sessionId", "updatedAt", "id"])
    .index("sessionId", ["sessionId"])
    .index("parentAttempt", ["parentRunId", "parentAttemptId"]),
} as const
