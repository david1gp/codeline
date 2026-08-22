import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ExecutionConvexClient } from "../../convex/executionConvexClient.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import { messageLoadDurableHistory } from "../../message/actions/messageLoadDurableHistory.js"
import type { messageTable } from "../../message/db/messageTable.js"

export async function sessionChatPrepare(
  database: DatabaseExecutor | undefined,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string },
  executionConvexClient?: ExecutionConvexClient,
): Promise<
  Result<{ history: Array<typeof messageTable.$inferSelect>; userMessage: typeof messageTable.$inferSelect }>
> {
  const op = "sessionChatPrepare"
  if (executionConvexClient !== undefined) return executionConvexClient.messagePrepare(userId, sessionId, input)
  const appended =
    database === undefined
      ? createResultError(op, "The message database is unavailable.")
      : await messageAppend(database, userId, sessionId, {
          clientRequestId: input.clientRequestId,
          content: input.content,
          role: "user",
        })
  if (!appended.success) return createResultError(op, appended.errorMessage)

  const history =
    database === undefined
      ? createResultError(op, "The message database is unavailable.")
      : await messageLoadDurableHistory(database, userId, sessionId)
  if (!history.success) return createResultError(op, history.errorMessage)

  return createResult({ history: history.data, userMessage: appended.data.message })
}
