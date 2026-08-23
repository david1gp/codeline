import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, isNull } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { type RunDelegationResult, runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

type RunDelegationFinalizeResult = {
  attempt: typeof attemptTable.$inferSelect
  changed: boolean
  delegation: typeof runDelegationTable.$inferSelect
  run: typeof runTable.$inferSelect
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

export async function runRepositoryDelegationFinalize(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  delegationId: string,
  input: unknown,
): Promise<Result<RunDelegationFinalizeResult>> {
  const op = "runRepositoryDelegationFinalize"
  const parsedInput = v.safeParse(runDelegationResultSchema, input)
  if (!parsedInput.success) return createResultError(op, "The delegation result is invalid.")

  return databaseExecutorTransactionRun<RunDelegationFinalizeResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

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
      if (delegation === undefined) return createResultError(op, "The delegation could not be found.")

      const [run] = await transaction
        .select()
        .from(runTable)
        .where(
          and(eq(runTable.id, delegation.childRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)),
        )
        .limit(1)
      if (run === undefined) return createResultError(op, "The delegated child run could not be found.")

      const [attempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (attempt === undefined) return createResultError(op, "The delegated child attempt could not be found.")
      if (delegation.childRunId !== run.id || attempt.runId !== run.id) {
        return createResultError(op, "The delegation ownership is inconsistent.")
      }
      if (run.status !== attempt.status || jsonCanonicalize(run.failure) !== jsonCanonicalize(attempt.failure)) {
        return createResultError(op, "The child run and current attempt are inconsistent.")
      }

      const result = parsedInput.output
      if (
        run.status !== "running" &&
        run.status !== "accepted" &&
        jsonCanonicalize(run.failure) !== jsonCanonicalize(resultFailureResolve(result))
      ) {
        return createResultError(op, "The terminal child failure metadata cannot be overwritten.")
      }
      if (delegation.finalizedResult !== null) {
        if (!resultMatches(delegation.finalizedResult, result)) {
          return createResultError(op, "The finalized delegation result cannot be overwritten.")
        }
        if (
          run.status !== result.status ||
          jsonCanonicalize(run.failure) !== jsonCanonicalize(resultFailureResolve(result))
        ) {
          return createResultError(op, "The finalized delegation lifecycle is inconsistent.")
        }
        return createResult({ attempt, changed: false, delegation, run })
      }

      if (!lifecycleAllowsFinalization(run.status, result.status)) {
        return createResultError(op, "The child run lifecycle does not allow delegation finalization.")
      }

      const now = new Date()
      const failure = resultFailureResolve(result)
      const [updatedRun] = await transaction
        .update(runTable)
        .set({
          failure,
          finishedAt: now,
          status: result.status,
          updatedAt: now,
        })
        .where(and(eq(runTable.id, run.id), eq(runTable.status, run.status)))
        .returning()
      if (updatedRun === undefined) return createResultError(op, "The delegated child run could not be finalized.")

      const [updatedAttempt] = await transaction
        .update(attemptTable)
        .set({
          failure,
          finishedAt: now,
          status: result.status,
          updatedAt: now,
        })
        .where(and(eq(attemptTable.id, attempt.id), eq(attemptTable.status, attempt.status)))
        .returning()
      if (updatedAttempt === undefined)
        return createResultError(op, "The delegated child attempt could not be finalized.")

      const [updatedDelegation] = await transaction
        .update(runDelegationTable)
        .set({ finalizedResult: result, updatedAt: now })
        .where(and(eq(runDelegationTable.id, delegation.id), isNull(runDelegationTable.finalizedResult)))
        .returning()
      if (updatedDelegation === undefined) return createResultError(op, "The delegation result could not be finalized.")

      return createResult({ attempt: updatedAttempt, changed: true, delegation: updatedDelegation, run: updatedRun })
    } catch (_error) {
      return createResultError(op, "The delegation result could not be persisted.")
    }
  })
}
