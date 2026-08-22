import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runRetryAdmissionResolve } from "../actions/runRetryAdmissionResolve.js"
import type { RunRetryAdmission } from "../schema/runRetryAdmissionSchema.js"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"
import { runJsonCanonicalize } from "./runJsonCanonicalize.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">

function runRetryAttemptStreamIdCreate(runId: string, ordinal: number): string {
  return `run-attempt:${runId}:${ordinal}`
}

export async function runRetryAttemptCreate(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  runId: string,
  options: { now?: number } = {},
): Promise<Result<{ admission: RunRetryAdmission | null; attempt: AttemptRecord; created: boolean; run: RunRecord }>> {
  const op = "runRetryAttemptCreate"
  const now = options.now ?? Date.now()
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const rawRun = await context.db
      .query("runs")
      .withIndex("id", (query: any) => query.eq("id", runId))
      .first()
    if (rawRun === null || rawRun.sessionId !== sessionId || rawRun.userId !== userId)
      return createResultError(op, "The run could not be found.")
    const rawAttempt = await context.db
      .query("attempts")
      .withIndex("runIdOrdinal", (query: any) => query.eq("runId", runId))
      .order("desc")
      .first()
    if (rawAttempt === null) return createResultError(op, "The latest run attempt could not be loaded.")
    const run = runDocumentPublic(rawRun)
    const latestAttempt = attemptDocumentPublic(rawAttempt)
    if (latestAttempt.sessionId !== sessionId || latestAttempt.userId !== userId)
      return createResultError(op, "The run attempt ownership is inconsistent.")
    if (
      run.status !== latestAttempt.status ||
      runJsonCanonicalize(run.failure) !== runJsonCanonicalize(latestAttempt.failure)
    )
      return createResultError(op, "The run and latest attempt statuses are inconsistent.")

    if (run.status === "accepted" && latestAttempt.ordinal > 1) {
      if (
        runJsonCanonicalize(run.snapshot) !== runJsonCanonicalize(latestAttempt.snapshot) ||
        runJsonCanonicalize(run.budget) !== runJsonCanonicalize(latestAttempt.budget) ||
        latestAttempt.streamId !== runRetryAttemptStreamIdCreate(run.id, latestAttempt.ordinal)
      )
        return createResultError(op, "The existing retry attempt is inconsistent with the run.")
      return createResult({ admission: null, attempt: latestAttempt, created: false, run })
    }
    if (latestAttempt.status !== "failed" || latestAttempt.failure === null)
      return createResultError(op, "The run retry was not admitted.")
    const admission = runRetryAdmissionResolve({
      attemptOrdinal: latestAttempt.ordinal,
      attemptStatus: latestAttempt.status,
      budget: run.budget,
      failure: latestAttempt.failure,
    })
    if (!admission.success) return createResultError(op, admission.errorMessage)
    if (admission.data.decision !== "retry" || admission.data.nextAttemptOrdinal === null)
      return createResultError(op, `The run retry was not admitted: ${admission.data.reason}.`)
    if (run.cancellationRequestedAt !== null) return createResultError(op, "The run retry was not admitted: cancelled.")
    if (now >= run.deadlineAt) return createResultError(op, "The run retry was not admitted: deadline_exceeded.")

    const ordinal = admission.data.nextAttemptOrdinal
    const attempt = {
      budget: run.budget,
      createdAt: now,
      id: uuidv7(),
      ordinal,
      runId,
      sessionId,
      snapshot: run.snapshot,
      status: "accepted" as const,
      streamId: runRetryAttemptStreamIdCreate(runId, ordinal),
      updatedAt: now,
      userId,
    }
    await context.db.insert("attempts", attempt)
    await context.db.patch("runs", rawRun._id, {
      failure: undefined,
      finishedAt: undefined,
      startedAt: undefined,
      status: "accepted",
      updatedAt: now,
    })
    return createResult({
      admission: admission.data,
      attempt: attemptDocumentPublic(attempt),
      created: true,
      run: runDocumentPublic({
        ...rawRun,
        failure: undefined,
        finishedAt: undefined,
        startedAt: undefined,
        status: "accepted",
        updatedAt: now,
      }),
    })
  } catch (_error) {
    return createResultError(op, "The next run attempt could not be persisted.")
  }
}
