import { createResult, type Result } from "@adaptive-ds/result"
import { and, desc, eq, isNull } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunDelegationResult, runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"
import { runDelegationHistoryToolProjectionPersist } from "../actions/runDelegationHistoryToolProjectionPersist.js"
import { attemptTable } from "./attemptTable.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

type RunDelegationFinalizeResult = {
  attempt: typeof attemptTable.$inferSelect
  changed: boolean
  delegation: typeof runDelegationTable.$inferSelect
  run: typeof runTable.$inferSelect
}

type RunRepositoryDelegationFinalizeRunUpdateInput = {
  currentStatus: string
  failure: ReturnType<typeof resultFailureResolve>
  id: string
  now: Date
  status: RunDelegationResult["status"]
}

type RunRepositoryDelegationFinalizeAttemptUpdateInput = RunRepositoryDelegationFinalizeRunUpdateInput & {
  id: string
}

type RunRepositoryDelegationFinalizeDelegationUpdateInput = {
  delegationId: string
  now: Date
  result: RunDelegationResult
}

type RunRepositoryDelegationFinalizeOptions = {
  attemptUpdate?: (
    transaction: DatabaseExecutor,
    input: RunRepositoryDelegationFinalizeAttemptUpdateInput,
  ) => Promise<Result<typeof attemptTable.$inferSelect>>
  delegationUpdate?: (
    transaction: DatabaseExecutor,
    input: RunRepositoryDelegationFinalizeDelegationUpdateInput,
  ) => Promise<Result<typeof runDelegationTable.$inferSelect>>
  now?: () => Date
  runUpdate?: (
    transaction: DatabaseExecutor,
    input: RunRepositoryDelegationFinalizeRunUpdateInput,
  ) => Promise<Result<typeof runTable.$inferSelect>>
}

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function resultMatches(left: unknown, right: RunDelegationResult): boolean {
  return jsonCanonicalize(left) === jsonCanonicalize(right)
}

function resultFailureResolve(result: RunDelegationResult) {
  return "failure" in result ? result.failure : null
}

function lifecycleAllowsFinalization(status: string, resultStatus: RunDelegationResult["status"]): boolean {
  if (status === "running") return true
  if (status === "accepted") return resultStatus === "aborted"
  return status === resultStatus
}

async function runRepositoryDelegationRunUpdatePersist(
  transaction: DatabaseExecutor,
  input: RunRepositoryDelegationFinalizeRunUpdateInput,
): Promise<Result<typeof runTable.$inferSelect>> {
  const op = "runRepositoryDelegationFinalize"
  try {
    const [run] = await transaction
      .update(runTable)
      .set({
        failure: input.failure,
        finishedAt: input.now,
        status: input.status,
        updatedAt: input.now,
      })
      .where(and(eq(runTable.id, input.id), eq(runTable.status, input.currentStatus)))
      .returning()
    if (run === undefined)
      return runResultCreateError(op, "The delegated child run could not be finalized.", runErrorCodes.transitionFailed)
    return createResult(run)
  } catch (_error) {
    return runResultCreateError(op, "The delegated child run could not be finalized.", runErrorCodes.transitionFailed)
  }
}

async function runRepositoryDelegationAttemptUpdatePersist(
  transaction: DatabaseExecutor,
  input: RunRepositoryDelegationFinalizeAttemptUpdateInput,
): Promise<Result<typeof attemptTable.$inferSelect>> {
  const op = "runRepositoryDelegationFinalize"
  try {
    const [attempt] = await transaction
      .update(attemptTable)
      .set({
        failure: input.failure,
        finishedAt: input.now,
        status: input.status,
        updatedAt: input.now,
      })
      .where(and(eq(attemptTable.id, input.id), eq(attemptTable.status, input.currentStatus)))
      .returning()
    if (attempt === undefined)
      return runResultCreateError(
        op,
        "The delegated child attempt could not be finalized.",
        runErrorCodes.attemptPersistenceFailed,
      )
    return createResult(attempt)
  } catch (_error) {
    return runResultCreateError(
      op,
      "The delegated child attempt could not be finalized.",
      runErrorCodes.attemptPersistenceFailed,
    )
  }
}

async function runRepositoryDelegationUpdatePersist(
  transaction: DatabaseExecutor,
  input: RunRepositoryDelegationFinalizeDelegationUpdateInput,
): Promise<Result<typeof runDelegationTable.$inferSelect>> {
  const op = "runRepositoryDelegationFinalize"
  try {
    const [delegation] = await transaction
      .update(runDelegationTable)
      .set({ finalizedResult: input.result, updatedAt: input.now })
      .where(and(eq(runDelegationTable.id, input.delegationId), isNull(runDelegationTable.finalizedResult)))
      .returning()
    if (delegation === undefined)
      return runResultCreateError(op, "The delegation result could not be finalized.", runErrorCodes.transitionFailed)
    return createResult(delegation)
  } catch (_error) {
    return runResultCreateError(op, "The delegation result could not be finalized.", runErrorCodes.transitionFailed)
  }
}

export async function runRepositoryDelegationFinalize(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  delegationId: string,
  input: unknown,
  options: RunRepositoryDelegationFinalizeOptions = {},
): Promise<Result<RunDelegationFinalizeResult>> {
  const op = "runRepositoryDelegationFinalize"
  const parsedInput = v.safeParse(runDelegationResultSchema, input)
  if (!parsedInput.success)
    return runResultCreateError(op, "The delegation result is invalid.", runErrorCodes.delegationInvalid)

  return databaseExecutorTransactionRun<RunDelegationFinalizeResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined)
        return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

      const [delegation] = await transaction
        .select()
        .from(runDelegationTable)
        .where(
          and(
            eq(runDelegationTable.id, delegationId),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
        .limit(1)
      if (delegation === undefined)
        return runResultCreateError(op, "The delegation could not be found.", runErrorCodes.delegationNotFound)

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(
          and(eq(runTable.id, delegation.childRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)),
        )
        .limit(1)
      if (run === undefined)
        return runResultCreateError(
          op,
          "The delegated child run could not be found.",
          runErrorCodes.delegatedChildNotFound,
        )

      const [attempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (attempt === undefined)
        return runResultCreateError(
          op,
          "The delegated child attempt could not be found.",
          runErrorCodes.delegatedChildAttemptNotFound,
        )
      if (delegation.childRunId !== run.id || attempt.runId !== run.id) {
        return runResultCreateError(op, "The delegation ownership is inconsistent.", runErrorCodes.stateInconsistent)
      }
      if (run.status !== attempt.status || jsonCanonicalize(run.failure) !== jsonCanonicalize(attempt.failure)) {
        return runResultCreateError(
          op,
          "The child run and current attempt are inconsistent.",
          runErrorCodes.stateInconsistent,
        )
      }

      const result = parsedInput.output
      if (delegation.finalizedResult !== null) {
        if (!resultMatches(delegation.finalizedResult, result)) {
          return runResultCreateError(
            op,
            "The finalized delegation result cannot be overwritten.",
            runErrorCodes.delegationFinalizationConflict,
          )
        }
        if (
          run.status !== result.status ||
          jsonCanonicalize(run.failure) !== jsonCanonicalize(resultFailureResolve(result))
        ) {
          return runResultCreateError(
            op,
            "The finalized delegation lifecycle is inconsistent.",
            runErrorCodes.stateInconsistent,
          )
        }
        const projected = await runDelegationHistoryToolProjectionPersist(transaction, userId, sessionId, delegation)
        if (!projected.success) return projected
        return createResult({ attempt, changed: false, delegation, run })
      }

      if (
        run.status !== "running" &&
        run.status !== "accepted" &&
        jsonCanonicalize(run.failure) !== jsonCanonicalize(resultFailureResolve(result))
      ) {
        return runResultCreateError(
          op,
          "The terminal child failure metadata cannot be overwritten.",
          runErrorCodes.failureMetadataImmutable,
        )
      }

      if (!lifecycleAllowsFinalization(run.status, result.status)) {
        return runResultCreateError(
          op,
          "The child run lifecycle does not allow delegation finalization.",
          runErrorCodes.delegationFinalizationConflict,
        )
      }

      const now = options.now?.() ?? new Date()
      const failure = resultFailureResolve(result)
      const updatedRun = await (options.runUpdate ?? runRepositoryDelegationRunUpdatePersist)(transaction, {
        currentStatus: run.status,
        failure,
        id: run.id,
        now,
        status: result.status,
      })
      if (!updatedRun.success) return updatedRun

      const updatedAttempt = await (options.attemptUpdate ?? runRepositoryDelegationAttemptUpdatePersist)(transaction, {
        currentStatus: attempt.status,
        failure,
        id: attempt.id,
        now,
        status: result.status,
      })
      if (!updatedAttempt.success) return updatedAttempt

      const updatedDelegation = await (options.delegationUpdate ?? runRepositoryDelegationUpdatePersist)(transaction, {
        delegationId: delegation.id,
        now,
        result,
      })
      if (!updatedDelegation.success) return updatedDelegation

      const projected = await runDelegationHistoryToolProjectionPersist(
        transaction,
        userId,
        sessionId,
        updatedDelegation.data,
      )
      if (!projected.success) return projected

      return createResult({
        attempt: updatedAttempt.data,
        changed: true,
        delegation: updatedDelegation.data,
        run: updatedRun.data,
      })
    } catch (_error) {
      return runResultCreateError(op, "The delegation result could not be persisted.", runErrorCodes.persistFailed)
    }
  })
}
