import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runActiveStateTable } from "./runActiveStateTable.js"

export async function runActiveStateRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
): Promise<Result<void>> {
  const op = "runActiveStateRepositoryDelete"
  try {
    await database
      .delete(runActiveStateTable)
      .where(
        and(
          eq(runActiveStateTable.runId, runId),
          eq(runActiveStateTable.sessionId, sessionId),
          eq(runActiveStateTable.userId, userId),
        ),
      )
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The active run state could not be cleared.")
  }
}
