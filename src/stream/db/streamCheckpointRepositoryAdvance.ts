import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamCheckpointTable } from "./streamCheckpointTable.js"

type StreamCheckpointRepositoryAdvanceResult = {
  advanced: boolean
  checkpoint: typeof streamCheckpointTable.$inferSelect
}

export async function streamCheckpointRepositoryAdvance(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
  lastSequence: number,
): Promise<Result<{ advanced: boolean; checkpoint: typeof streamCheckpointTable.$inferSelect }>> {
  const op = "streamCheckpointRepositoryAdvance"
  if (!Number.isSafeInteger(lastSequence) || lastSequence < 0) {
    return createResultError(op, "The checkpoint sequence must be a nonnegative integer.")
  }
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")

  return databaseExecutorTransactionRun<StreamCheckpointRepositoryAdvanceResult>(database, async (executor) => {
    try {
      const [session] = await executor
        .select({ archivedAt: sessionTable.archivedAt })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const [checkpoint] = await executor
        .select()
        .from(streamCheckpointTable)
        .where(and(eq(streamCheckpointTable.sessionId, sessionId), eq(streamCheckpointTable.streamId, streamId)))
        .limit(1)
      if (checkpoint === undefined) return createResultError(op, "The stream checkpoint could not be found.")
      if (session.archivedAt !== null) return createResultError(op, "The session is archived.")
      if (lastSequence <= checkpoint.lastSequence) return createResult({ advanced: false, checkpoint })

      const [updated] = await executor
        .update(streamCheckpointTable)
        .set({ lastSequence, updatedAt: new Date() })
        .where(
          and(
            eq(streamCheckpointTable.sessionId, sessionId),
            eq(streamCheckpointTable.streamId, streamId),
            eq(streamCheckpointTable.lastSequence, checkpoint.lastSequence),
          ),
        )
        .returning()
      if (updated !== undefined) {
        return createResult({ advanced: true, checkpoint: updated })
      }
      return createResult({ advanced: false, checkpoint })
    } catch (_error) {
      return createResultError(op, "The stream checkpoint could not be advanced.")
    }
  })
}
