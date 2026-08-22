import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { runDelegationResultSchema, type RunDelegationResult } from "../schema/runDelegationResultSchema.js"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDelegationDocumentPublic } from "./runDelegationDocumentPublic.js"
import type { RunDelegationRecord } from "./runDelegationRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"
import { runJsonCanonicalize } from "./runJsonCanonicalize.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">

function resultFailureResolve(result: RunDelegationResult) {
  return "failure" in result ? result.failure : null
}

function lifecycleAllowsFinalization(status: string, resultStatus: RunDelegationResult["status"]): boolean {
  if (status === "running") return true
  if (status === "accepted") return resultStatus === "aborted"
  return status === resultStatus
}

export async function runDelegationFinalize(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  delegationId: string,
  input: unknown,
  now = Date.now(),
): Promise<Result<{ attempt: AttemptRecord; changed: boolean; delegation: RunDelegationRecord; run: RunRecord }>> {
  const op = "runDelegationFinalize"
  const parsed = v.safeParse(runDelegationResultSchema, input)
  if (!parsed.success) return createResultError(op, "The delegation result is invalid.")
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const rawDelegation = await context.db
      .query("runDelegations")
      .withIndex("id", (query: any) => query.eq("id", delegationId))
      .first()
    if (rawDelegation === null || rawDelegation.sessionId !== sessionId || rawDelegation.userId !== userId)
      return createResultError(op, "The delegation could not be found.")
    const rawRun = await context.db
      .query("runs")
      .withIndex("id", (query: any) => query.eq("id", rawDelegation.childRunId))
      .first()
    if (rawRun === null || rawRun.sessionId !== sessionId || rawRun.userId !== userId)
      return createResultError(op, "The delegated child run could not be found.")
    const rawAttempt = await context.db
      .query("attempts")
      .withIndex("runIdOrdinal", (query: any) => query.eq("runId", rawRun.id))
      .order("desc")
      .first()
    if (rawAttempt === null) return createResultError(op, "The delegated child attempt could not be found.")
    const delegation = runDelegationDocumentPublic(rawDelegation)
    const run = runDocumentPublic(rawRun)
    const attempt = attemptDocumentPublic(rawAttempt)
    if (run.status !== attempt.status || runJsonCanonicalize(run.failure) !== runJsonCanonicalize(attempt.failure))
      return createResultError(op, "The child run and current attempt are inconsistent.")

    const result = parsed.output
    const resultFailure = resultFailureResolve(result)
    if (
      run.status !== "running" &&
      run.status !== "accepted" &&
      runJsonCanonicalize(run.failure) !== runJsonCanonicalize(resultFailure)
    )
      return createResultError(op, "The terminal child failure metadata cannot be overwritten.")
    if (delegation.finalizedResult !== null) {
      if (runJsonCanonicalize(delegation.finalizedResult) !== runJsonCanonicalize(result))
        return createResultError(op, "The finalized delegation result cannot be overwritten.")
      if (run.status !== result.status || runJsonCanonicalize(run.failure) !== runJsonCanonicalize(resultFailure))
        return createResultError(op, "The finalized delegation lifecycle is inconsistent.")
      return createResult({ attempt, changed: false, delegation, run })
    }
    if (!lifecycleAllowsFinalization(run.status, result.status))
      return createResultError(op, "The child run lifecycle does not allow delegation finalization.")

    const update = {
      failure: resultFailure === null ? undefined : resultFailure,
      finishedAt: now,
      status: result.status,
      updatedAt: now,
    }
    await context.db.patch("runs", rawRun._id, update)
    await context.db.patch("attempts", rawAttempt._id, update)
    await context.db.patch("runDelegations", rawDelegation._id, { finalizedResult: result, updatedAt: now })
    return createResult({
      attempt: attemptDocumentPublic({
        ...rawAttempt,
        ...update,
        failure: resultFailure,
        finishedAt: now,
        updatedAt: now,
      }),
      changed: true,
      delegation: runDelegationDocumentPublic({ ...rawDelegation, finalizedResult: result, updatedAt: now }),
      run: runDocumentPublic({ ...rawRun, ...update, failure: resultFailure, finishedAt: now, updatedAt: now }),
    })
  } catch (_error) {
    return createResultError(op, "The delegation result could not be persisted.")
  }
}
