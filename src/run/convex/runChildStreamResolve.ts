import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"

type RunQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function runChildStreamResolve(
  context: RunQueryContext,
  userId: string,
  sessionId: string,
  streamId: string,
): Promise<Result<boolean>> {
  const op = "runChildStreamResolve"
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")
  try {
    const foundAttempt = await context.db
      .query("attempts")
      .withIndex("streamId", (query: any) => query.eq("streamId", streamId))
      .first()
    if (foundAttempt === null || foundAttempt.sessionId !== sessionId || foundAttempt.userId !== userId)
      return createResult(false)
    const delegation = await context.db
      .query("runDelegations")
      .withIndex("childRunId", (query: any) => query.eq("childRunId", foundAttempt.runId))
      .first()
    return createResult(delegation !== null && delegation.sessionId === sessionId && delegation.userId === userId)
  } catch (_error) {
    return createResultError(op, "The child stream could not be resolved.")
  }
}
