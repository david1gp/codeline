import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, eq, or } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
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
  if (clientRunId.length === 0)
    return runResultCreateError(op, "The client run ID is required.", runErrorCodes.identifiersRequired)

  try {
    // A reloaded tab holds no client run identifier: it rediscovers a detached run
    // by its durable identifier through the active-run list, so both identifiers
    // must resolve the same run. Both are unique within one session.
    const [run] = await database
      .select()
      .from(runTable)
      .where(
        and(
          eq(runTable.userId, userId),
          eq(runTable.sessionId, sessionId),
          or(eq(runTable.clientRunId, clientRunId), eq(runTable.id, clientRunId)),
        ),
      )
      .limit(1)
    if (run === undefined) return runResultCreateError(op, "The run could not be found.", runErrorCodes.notFound)

    const attempts = await database
      .select()
      .from(attemptTable)
      .where(
        and(eq(attemptTable.runId, run.id), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
      )
      .orderBy(asc(attemptTable.ordinal))
    const attempt = attempts.at(-1)
    if (attempt === undefined)
      return runResultCreateError(op, "The run attempt could not be found.", runErrorCodes.attemptNotFound)
    if (attempt.sessionId !== sessionId || attempt.userId !== userId) {
      return runResultCreateError(op, "The run attempt ownership is inconsistent.", runErrorCodes.stateInconsistent)
    }
    return createResult({ attempt, attempts, run })
  } catch (_error) {
    return runResultCreateError(op, "The run could not be loaded.", runErrorCodes.persistFailed)
  }
}
