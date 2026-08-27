import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import type { messageTable } from "../db/messageTable.js"
import { messageAppend } from "./messageAppend.js"
import { messageLoadDurableHistory } from "./messageLoadDurableHistory.js"

export function messagePrepare(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string; metadata?: unknown },
): Promise<
  Result<{ history: Array<typeof messageTable.$inferSelect>; userMessage: typeof messageTable.$inferSelect }>
> {
  const op = "messagePrepare"
  return databaseExecutorTransactionRun(database, async (executor) => {
    const appended = await messageAppend(executor, userId, sessionId, { ...input, role: "user" })
    if (!appended.success) return createResultError(op, appended.errorMessage)

    const history = await messageLoadDurableHistory(executor, userId, sessionId)
    if (!history.success) return createResultError(op, history.errorMessage)

    return createResult({ history: history.data, userMessage: appended.data.message })
  })
}
