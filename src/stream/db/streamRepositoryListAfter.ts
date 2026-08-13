import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, gt } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamEventTable } from "./streamEventTable.js"

const streamEventListMaxLimit = 100

export async function streamRepositoryListAfter(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
  options: { afterSequence: number; limit: number },
): Promise<Result<Array<typeof streamEventTable.$inferSelect>>> {
  const op = "streamRepositoryListAfter"
  if (!Number.isSafeInteger(options.afterSequence) || options.afterSequence < 0) {
    return createResultError(op, "The stream event cursor must be a nonnegative integer.")
  }
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > streamEventListMaxLimit) {
    return createResultError(op, "The stream event limit must be between 1 and 100.")
  }
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")

  try {
    const [session] = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    return createResult(
      await database
        .select()
        .from(streamEventTable)
        .where(
          and(
            eq(streamEventTable.sessionId, sessionId),
            eq(streamEventTable.streamId, streamId),
            gt(streamEventTable.sequence, options.afterSequence),
          ),
        )
        .orderBy(asc(streamEventTable.sequence))
        .limit(options.limit),
    )
  } catch (_error) {
    return createResultError(op, "The stream events could not be loaded.")
  }
}
