import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import { messageLoadDurableHistory } from "../../message/actions/messageLoadDurableHistory.js"
import type { messageTable } from "../../message/db/messageTable.js"

export async function sessionChatPrepare(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string },
): Promise<
  Result<{ history: Array<typeof messageTable.$inferSelect>; userMessage: typeof messageTable.$inferSelect }>
> {
  const op = "sessionChatPrepare"
  const appended = await messageAppend(database, userId, sessionId, {
    clientRequestId: input.clientRequestId,
    content: input.content,
    role: "user",
  })
  if (!appended.success) return createResultError(op, appended.errorMessage)

  const history = await messageLoadDurableHistory(database, userId, sessionId)
  if (!history.success) return createResultError(op, history.errorMessage)

  return createResult({ history: history.data, userMessage: appended.data.message })
}
