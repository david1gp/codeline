import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

export async function runRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  clientRunId: string,
): Promise<
  Result<{
    attempt: typeof attemptTable.$inferSelect
    attempts: Array<typeof attemptTable.$inferSelect>
    run: typeof runTable.$inferSelect
  }>
> {
  const op = "runRepositoryLoad"
  if (clientRunId.length === 0) return createResultError(op, "The client run ID is required.")

  try {
    const [run] = await database
      .select()
      .from(runTable)
      .where(and(eq(runTable.userId, userId), eq(runTable.sessionId, sessionId), eq(runTable.clientRunId, clientRunId)))
      .limit(1)
    if (run === undefined) return createResultError(op, "The run could not be found.")

    const attempts = await database
      .select()
      .from(attemptTable)
      .where(
        and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
      )
      .orderBy(asc(attemptTable.ordinal))
    const attempt = attempts.at(-1)
    if (attempt === undefined) return createResultError(op, "The run attempt could not be found.")
    if (attempt.sessionId !== sessionId || attempt.userId !== userId) {
      return createResultError(op, "The run attempt ownership is inconsistent.")
    }
    return createResult({ attempt, attempts, run })
  } catch (_error) {
    return createResultError(op, "The run could not be loaded.")
  }
}
