import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { runTransitionInputSchema } from "../schema/runTransitionInputSchema.js"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"
import { runJsonCanonicalize } from "./runJsonCanonicalize.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">
const terminalStatuses = new Set(["succeeded", "failed", "aborted"])

function statusTransitionIsLegal(current: string, next: string): boolean {
  if (current === next) return true
  if (current === "accepted") return next === "running" || next === "aborted"
  if (current === "running") return terminalStatuses.has(next)
  return false
}

export async function runTransition(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  runId: string,
  input: unknown,
  now = Date.now(),
): Promise<Result<{ changed: boolean; run: RunRecord; attempt: AttemptRecord }>> {
  const op = "runTransition"
  const parsed = v.safeParse(runTransitionInputSchema, input)
  if (!parsed.success) return createResultError(op, "The run transition input is invalid.")
  const nextFailure = parsed.output.failure ?? null
  if (parsed.output.status !== "failed" && parsed.output.status !== "aborted" && nextFailure !== null)
    return createResultError(op, "Failure metadata is only valid for failed or aborted runs.")
  if (parsed.output.status === "failed" && nextFailure === null)
    return createResultError(op, "Failed runs require failure metadata.")

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
    if (rawAttempt === null) return createResultError(op, "The run attempt could not be found.")
    if (rawAttempt.sessionId !== sessionId || rawAttempt.userId !== userId)
      return createResultError(op, "The run attempt ownership is inconsistent.")
    const run = runDocumentPublic(rawRun)
    const attempt = attemptDocumentPublic(rawAttempt)
    if (run.status !== attempt.status || runJsonCanonicalize(run.failure) !== runJsonCanonicalize(attempt.failure))
      return createResultError(op, "The run and attempt statuses are inconsistent.")
    if (!statusTransitionIsLegal(run.status, parsed.output.status))
      return createResultError(op, "The run status transition is not allowed.")
    if (run.status === parsed.output.status) {
      if (runJsonCanonicalize(run.failure) !== runJsonCanonicalize(nextFailure))
        return createResultError(op, "The terminal run failure metadata cannot be overwritten.")
      return createResult({ changed: false, run, attempt })
    }

    const update: Record<string, unknown> = {
      failure: nextFailure === null ? undefined : nextFailure,
      status: parsed.output.status,
      updatedAt: now,
      ...(parsed.output.status === "running" ? { startedAt: now } : {}),
      ...(terminalStatuses.has(parsed.output.status) ? { finishedAt: now } : {}),
    }
    await context.db.patch("runs", rawRun._id, update)
    await context.db.patch("attempts", rawAttempt._id, update)
    return createResult({
      changed: true,
      run: runDocumentPublic({ ...rawRun, ...update, failure: nextFailure, updatedAt: now }),
      attempt: attemptDocumentPublic({ ...rawAttempt, ...update, failure: nextFailure, updatedAt: now }),
    })
  } catch (_error) {
    return createResultError(op, "The run transition could not be persisted.")
  }
}
