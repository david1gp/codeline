import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messagePrepare } from "../../message/actions/messagePrepare.js"
import type { messageTable } from "../../message/db/messageTable.js"

export async function sessionChatPrepare(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string; metadata?: unknown },
): Promise<
  Result<{ history: Array<typeof messageTable.$inferSelect>; userMessage: typeof messageTable.$inferSelect }>
> {
  const op = "sessionChatPrepare"
  const prepared = await messagePrepare(database, userId, sessionId, input)
  if (!prepared.success) return createResultError(op, prepared.errorMessage)
  return createResult({ history: prepared.data.history, userMessage: prepared.data.userMessage })
}
