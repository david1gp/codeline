import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"

type RunQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function runLoad(
  context: RunQueryContext,
  userId: string,
  sessionId: string,
  clientRunId: string,
): Promise<Result<{ attempt: AttemptRecord; attempts: AttemptRecord[]; run: RunRecord }>> {
  const op = "runLoad"
  if (clientRunId.length === 0) return createResultError(op, "The client run ID is required.")
  try {
    const run = await context.db
      .query("runs")
      .withIndex("sessionIdClientRunId", (query: any) =>
        query.eq("sessionId", sessionId).eq("clientRunId", clientRunId),
      )
      .first()
    if (run === null || run.userId !== userId) return createResultError(op, "The run could not be found.")
    const attempts = (await context.db
      .query("attempts")
      .withIndex("runIdOrdinal", (query: any) => query.eq("runId", run.id))
      .order("asc")
      .collect()) as Array<AttemptRecord & { _id?: string }>
    if (attempts.length === 0) return createResultError(op, "The run attempt could not be found.")
    if (attempts.some((attempt) => attempt.sessionId !== sessionId || attempt.userId !== userId))
      return createResultError(op, "The run attempt ownership is inconsistent.")
    const publicAttempts = attempts.map(attemptDocumentPublic)
    return createResult({
      attempt: publicAttempts[publicAttempts.length - 1] as AttemptRecord,
      attempts: publicAttempts,
      run: runDocumentPublic(run),
    })
  } catch (_error) {
    return createResultError(op, "The run could not be loaded.")
  }
}
