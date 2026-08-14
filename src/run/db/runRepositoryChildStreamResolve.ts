import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { attemptTable } from "./attemptTable.js"
import { runDelegationTable } from "./runDelegationTable.js"

export async function runRepositoryChildStreamResolve(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
): Promise<Result<boolean>> {
  const op = "runRepositoryChildStreamResolve"
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")

  try {
    const [child] = await database
      .select({ id: runDelegationTable.id })
      .from(runDelegationTable)
      .innerJoin(attemptTable, eq(attemptTable.runId, runDelegationTable.childRunId))
      .where(
        and(
          eq(runDelegationTable.userId, userId),
          eq(runDelegationTable.sessionId, sessionId),
          eq(attemptTable.userId, userId),
          eq(attemptTable.sessionId, sessionId),
          eq(attemptTable.streamId, streamId),
        ),
      )
      .limit(1)
    return createResult(child !== undefined)
  } catch (_error) {
    return createResultError(op, "The child stream could not be resolved.")
  }
}
