import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { asc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageTable } from "../../message/db/messageTable.js"

export async function sessionCompactionCoverageValidate(
  database: DatabaseExecutor,
  sessionId: string,
  coveredSequence: number,
): Promise<Result<void>> {
  const op = "sessionCompactionCoverageValidate"
  if (!Number.isSafeInteger(coveredSequence) || coveredSequence <= 0)
    return createResultError(op, "The compaction coverage boundary must be positive.")

  try {
    const messages = await database
      .select({ finalizedAt: messageTable.finalizedAt, sequence: messageTable.sequence })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(asc(messageTable.sequence))

    const lastSequence = messages.at(-1)?.sequence ?? 0
    if (coveredSequence > lastSequence)
      return createResultError(op, "The compaction coverage boundary is not a durable message sequence.")

    for (const [index, message] of messages.entries()) {
      if (message.sequence !== index + 1)
        return createResultError(op, "The durable message sequence contains a missing range.")
      if (message.finalizedAt === null)
        return createResultError(op, "The compaction range contains an unfinalized durable message.")
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The compaction coverage range could not be validated.")
  }
}
