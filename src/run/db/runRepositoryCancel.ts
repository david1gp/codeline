import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq, inArray, isNull } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunCancelInput, runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

const nonterminalStatuses = ["accepted", "running"] as const

type RunCancelResult = {
  cancelledRunIds: string[]
  changed: boolean
  descendantsCancelled: number
  run: typeof runTable.$inferSelect
}

export async function runRepositoryCancel(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  input: RunCancelInput = {},
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

      if (!nonterminalStatuses.includes(target.status as (typeof nonterminalStatuses)[number])) {
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

      const now = new Date()
      let changed = false
      if (target.cancellationRequestedAt === null) {
        const [updatedTarget] = await transaction
          .update(runTable)
          .set({
            cancellationKind: "requested",
            cancellationRequestedAt: now,
            cancellationSourceRunId: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(runTable.id, target.id),
              inArray(runTable.status, nonterminalStatuses),
              isNull(runTable.cancellationRequestedAt),
            ),
          )
          .returning()
        if (updatedTarget === undefined)
          return runResultCreateError(op, "The run could not be cancelled.", runErrorCodes.cancellationFailed)
        target = updatedTarget
        changed = true
      }

      const requestedAt = target.cancellationRequestedAt ?? now
      const cancelledDescendants =
        descendantRunIds.length === 0
          ? []
          : await transaction
              .update(runTable)
              .set({
                cancellationKind: "ancestor",
                cancellationRequestedAt: requestedAt,
                cancellationSourceRunId: target.id,
                updatedAt: now,
              })
              .where(
                and(
                  eq(runTable.userId, userId),
                  eq(runTable.sessionId, sessionId),
                  inArray(runTable.id, descendantRunIds),
                  inArray(runTable.status, nonterminalStatuses),
                  isNull(runTable.cancellationRequestedAt),
                ),
              )
              .returning()
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
