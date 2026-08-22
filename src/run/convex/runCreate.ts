import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runBudgetSchema } from "../schema/runBudgetSchema.js"
import { runCreateInputSchema } from "../schema/runCreateInputSchema.js"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"
import { runJsonCanonicalize } from "./runJsonCanonicalize.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">

function runImmutableInputMatches(
  run: RunRecord,
  input: { budget: unknown; snapshot: unknown; streamId: string },
): boolean {
  return (
    run.streamId === input.streamId &&
    runJsonCanonicalize(run.snapshot) === runJsonCanonicalize(input.snapshot) &&
    runJsonCanonicalize(run.budget) === runJsonCanonicalize(input.budget)
  )
}

export async function runCreate(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  input: unknown,
  now = Date.now(),
): Promise<Result<{ created: boolean; run: RunRecord; attempt: AttemptRecord }>> {
  const op = "runCreate"
  const parsedInput = v.safeParse(runCreateInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The run creation input is invalid.")
  const parsedBudget = v.safeParse(runBudgetSchema, parsedInput.output.budget ?? {})
  if (!parsedBudget.success) return createResultError(op, "The run budget is invalid.")

  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    if (
      session.serverId !== parsedInput.output.snapshot.target.serverId ||
      session.primaryAgentId !== parsedInput.output.snapshot.target.agentId
    )
      return createResultError(op, "The run snapshot target does not match the session target.")

    const existing = await context.db
      .query("runs")
      .withIndex("sessionIdClientRunId", (query: any) =>
        query.eq("sessionId", sessionId).eq("clientRunId", parsedInput.output.clientRunId),
      )
      .first()
    if (existing !== null) {
      const existingRun = runDocumentPublic(existing)
      if (!runImmutableInputMatches(existingRun, { ...parsedInput.output, budget: parsedBudget.output }))
        return createResultError(op, "The client run ID conflicts with different immutable run input.")
      const attempt = await context.db
        .query("attempts")
        .withIndex("runIdOrdinal", (query: any) => query.eq("runId", existing.id))
        .order("desc")
        .first()
      if (attempt === null) return createResultError(op, "The run attempt could not be loaded.")
      return createResult({ created: false, run: existingRun, attempt: attemptDocumentPublic(attempt) })
    }

    const streamRun = await context.db
      .query("runs")
      .withIndex("streamId", (query: any) => query.eq("streamId", parsedInput.output.streamId))
      .first()
    if (streamRun !== null) return createResultError(op, "The run stream ID conflicts with an existing run.")
    const streamAttempt = await context.db
      .query("attempts")
      .withIndex("streamId", (query: any) => query.eq("streamId", parsedInput.output.streamId))
      .first()
    if (streamAttempt !== null) return createResultError(op, "The run stream ID conflicts with an existing attempt.")

    const deadlineAt = now + parsedBudget.output.maxDurationMs
    const run = {
      budget: parsedBudget.output,
      clientRunId: parsedInput.output.clientRunId,
      createdAt: now,
      deadlineAt,
      id: uuidv7(),
      sessionId,
      snapshot: parsedInput.output.snapshot,
      status: "accepted" as const,
      streamId: parsedInput.output.streamId,
      updatedAt: now,
      userId,
    }
    await context.db.insert("runs", run)
    const attempt = {
      budget: parsedBudget.output,
      createdAt: now,
      id: uuidv7(),
      ordinal: 1,
      runId: run.id,
      sessionId,
      snapshot: parsedInput.output.snapshot,
      status: "accepted" as const,
      streamId: parsedInput.output.streamId,
      updatedAt: now,
      userId,
    }
    await context.db.insert("attempts", attempt)
    return createResult({ created: true, run: runDocumentPublic(run), attempt: attemptDocumentPublic(attempt) })
  } catch (_error) {
    return createResultError(op, "The run could not be created.")
  }
}
