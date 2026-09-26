import { createResult, type Result } from "@adaptive-ds/result"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { runRetryAdmissionResolve } from "../actions/runRetryAdmissionResolve.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunCancelInput, runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

const nonterminalStatuses = ["accepted", "running"] as const

type RunCancelResult = {
  cancelledRunIds: string[]
  changed: boolean
  descendantsCancelled: number
  run: typeof runTable.$inferSelect
}

type RunCancelOptions = {
  descendantCancellationUpdate?: (
    transaction: DatabaseExecutor,
    input: {
      now: Date
      requestedAt: Date
      runIds: string[]
      sessionId: string
      sourceRunId: string
      userId: string
    },
  ) => Promise<Result<(typeof runTable.$inferSelect)[]>>
  now?: () => Date
  targetCancellationUpdate?: (
    transaction: DatabaseExecutor,
    input: { id: string; now: Date; status: string },
  ) => Promise<Result<typeof runTable.$inferSelect>>
}

async function runCancellationTargetUpdate(
  transaction: DatabaseExecutor,
  input: { id: string; now: Date; status: string },
): Promise<Result<typeof runTable.$inferSelect>> {
  const op = "runRepositoryCancel"
  try {
    const [run] = await transaction
      .update(runTable)
      .set({
        cancellationKind: "requested",
        cancellationRequestedAt: input.now,
        cancellationSourceRunId: null,
        updatedAt: input.now,
      })
      .where(
        and(eq(runTable.id, input.id), eq(runTable.status, input.status), isNull(runTable.cancellationRequestedAt)),
      )
      .returning()
    if (run === undefined)
      return runResultCreateError(op, "The run could not be cancelled.", runErrorCodes.cancellationFailed)
    return createResult(run)
  } catch (_error) {
    return runResultCreateError(op, "The run could not be cancelled.", runErrorCodes.cancellationFailed)
  }
}

async function runCancellationDescendantsUpdate(
  transaction: DatabaseExecutor,
  input: {
    now: Date
    requestedAt: Date
    runIds: string[]
    sessionId: string
    sourceRunId: string
    userId: string
  },
): Promise<Result<(typeof runTable.$inferSelect)[]>> {
  const op = "runRepositoryCancel"
  try {
    const runs = await transaction
      .update(runTable)
      .set({
        cancellationKind: "ancestor",
        cancellationRequestedAt: input.requestedAt,
        cancellationSourceRunId: input.sourceRunId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(runTable.userId, input.userId),
          eq(runTable.sessionId, input.sessionId),
          inArray(runTable.id, input.runIds),
          inArray(runTable.status, nonterminalStatuses),
          isNull(runTable.cancellationRequestedAt),
        ),
      )
      .returning()
    return createResult(runs)
  } catch (_error) {
    return runResultCreateError(op, "The run descendants could not be cancelled.", runErrorCodes.cancellationFailed)
  }
}

async function runFailedRetryCancellationAdmit(
  transaction: DatabaseExecutor,
  target: typeof runTable.$inferSelect,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  if (target.status !== "failed" || target.failure === null) return false

  const [attempt] = await transaction
    .select({ failure: attemptTable.failure, ordinal: attemptTable.ordinal, status: attemptTable.status })
    .from(attemptTable)
    .where(
      and(eq(attemptTable.runId, target.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
    )
    .orderBy(desc(attemptTable.ordinal))
    .limit(1)
  if (attempt === undefined || attempt.failure === null) return false

  const admission = runRetryAdmissionResolve({
    attemptOrdinal: attempt.ordinal,
    attemptStatus: attempt.status,
    budget: target.budget,
    executionEvidence: "unknown",
    failure: attempt.failure,
  })
  return admission.success && admission.data.decision === "retry"
}

export async function runRepositoryCancel(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: RunCancelInput = {},
  options: RunCancelOptions = {},
): Promise<Result<RunCancelResult>> {
  const op = "runRepositoryCancel"
  const parsedInput = v.safeParse(runCancelInputSchema, input)
  if (!parsedInput.success)
    return runResultCreateError(op, "The run cancellation input is invalid.", runErrorCodes.invalidInput)
  const parsedRequestedKind = v.safeParse(runCancellationKindSchema, parsedInput.output.kind)
  if (!parsedRequestedKind.success || parsedRequestedKind.output !== "requested") {
    return runResultCreateError(op, "The run cancellation kind is invalid.", runErrorCodes.cancellationKindInvalid)
  }

  return databaseExecutorTransactionRun<RunCancelResult>(database, async (transaction) => {
    try {
      const [targetDelegation] = await transaction
        .select({ rootRunId: runDelegationTable.rootRunId })
        .from(runDelegationTable)
        .where(
          and(
            eq(runDelegationTable.childRunId, runId),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
        .limit(1)
      const rootRunId = targetDelegation?.rootRunId ?? runId

      const [root] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, rootRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (root === undefined) return runResultCreateError(op, "The run could not be found.", runErrorCodes.notFound)

      let target = root
      if (root.id !== runId) {
        const [lockedTarget] = await transaction
          .select()
          .from(runTable)
          .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
          .limit(1)
        if (lockedTarget === undefined)
          return runResultCreateError(op, "The run could not be found.", runErrorCodes.notFound)
        target = lockedTarget
      }

      const targetCancellationAdmitted =
        nonterminalStatuses.includes(target.status as (typeof nonterminalStatuses)[number]) ||
        (await runFailedRetryCancellationAdmit(transaction, target, sessionId, userId))
      if (!targetCancellationAdmitted) {
        return createResult({ cancelledRunIds: [], changed: false, descendantsCancelled: 0, run: target })
      }
      if (target.cancellationKind === "ancestor") {
        return createResult({ cancelledRunIds: [], changed: false, descendantsCancelled: 0, run: target })
      }

      const delegations = await transaction
        .select({ childRunId: runDelegationTable.childRunId, parentRunId: runDelegationTable.parentRunId })
        .from(runDelegationTable)
        .where(
          and(
            eq(runDelegationTable.rootRunId, root.id),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
      const childRunIdsByParent = new Map<string, string[]>()
      for (const delegation of delegations) {
        const childRunIds = childRunIdsByParent.get(delegation.parentRunId) ?? []
        childRunIds.push(delegation.childRunId)
        childRunIdsByParent.set(delegation.parentRunId, childRunIds)
      }

      const descendantRunIds: string[] = []
      const visitedRunIds = new Set<string>([target.id])
      const pendingRunIds = [target.id]
      while (pendingRunIds.length > 0) {
        const parentRunId = pendingRunIds.pop()
        if (parentRunId === undefined) continue
        for (const childRunId of childRunIdsByParent.get(parentRunId) ?? []) {
          if (visitedRunIds.has(childRunId)) continue
          visitedRunIds.add(childRunId)
          descendantRunIds.push(childRunId)
          pendingRunIds.push(childRunId)
        }
      }

      const now = options.now?.() ?? new Date()
      if (Number.isNaN(now.getTime()))
        return runResultCreateError(op, "The cancellation clock is invalid.", runErrorCodes.clockInvalid)
      let changed = false
      if (target.cancellationRequestedAt === null) {
        const targetUpdated = await (options.targetCancellationUpdate ?? runCancellationTargetUpdate)(transaction, {
          id: target.id,
          now,
          status: target.status,
        })
        if (!targetUpdated.success) return targetUpdated
        target = targetUpdated.data
        changed = true
      }

      const requestedAt = target.cancellationRequestedAt ?? now
      let cancelledDescendants: (typeof runTable.$inferSelect)[] = []
      if (descendantRunIds.length > 0) {
        const descendantsUpdated = await (options.descendantCancellationUpdate ?? runCancellationDescendantsUpdate)(
          transaction,
          {
            now,
            requestedAt,
            runIds: descendantRunIds,
            sessionId,
            sourceRunId: target.id,
            userId,
          },
        )
        if (!descendantsUpdated.success) return descendantsUpdated
        cancelledDescendants = descendantsUpdated.data
      }
      if (cancelledDescendants.length > 0) changed = true

      return createResult({
        cancelledRunIds: changed ? [target.id, ...cancelledDescendants.map(({ id }) => id)] : [],
        changed,
        descendantsCancelled: cancelledDescendants.length,
        run: target,
      })
    } catch (_error) {
      return runResultCreateError(op, "The run cancellation could not be persisted.", runErrorCodes.cancellationFailed)
    }
  })
}
