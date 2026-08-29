import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { sessionCompactionContextReconstruct } from "../../compaction/actions/sessionCompactionContextReconstruct.js"
import type { CompactionMessage } from "../../compaction/compactionMessage.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messagePrepare } from "../../message/actions/messagePrepare.js"
import type { messageTable } from "../../message/db/messageTable.js"

export async function sessionChatPrepare(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string; metadata?: unknown },
): Promise<
  Result<{
    history: Array<CompactionMessage>
    sourceRevision: number
    userMessage: typeof messageTable.$inferSelect
  }>
> {
  const op = "sessionChatPrepare"
  const prepared = await messagePrepare(database, userId, sessionId, input)
  if (!prepared.success) return createResultError(op, prepared.errorMessage)
  const reconstructed = await sessionCompactionContextReconstruct(database, userId, organizationId, sessionId)
  if (!reconstructed.success) return createResultError(op, reconstructed.errorMessage)
  return createResult({
    history: reconstructed.data.history,
    sourceRevision: prepared.data.sessionRevision,
    userMessage: prepared.data.userMessage,
  })
}
