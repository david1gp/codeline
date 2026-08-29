import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { messageTable } from "../db/messageTable.js"
import { messageAppend } from "./messageAppend.js"
import { messageLoadDurableHistory } from "./messageLoadDurableHistory.js"

export function messagePrepare(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string; metadata?: unknown },
): Promise<
  Result<{
    history: Array<typeof messageTable.$inferSelect>
    sessionRevision: number
    userMessage: typeof messageTable.$inferSelect
  }>
> {
  const op = "messagePrepare"
  return databaseExecutorTransactionRun(database, async (executor) => {
    const appended = await messageAppend(executor, userId, sessionId, { ...input, role: "user" })
    if (!appended.success) return createResultError(op, appended.errorMessage)

    const history = await messageLoadDurableHistory(executor, userId, sessionId)
    if (!history.success) return createResultError(op, history.errorMessage)

    const [session] = await executor
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    return createResult({
      history: history.data,
      sessionRevision: session.revision,
      userMessage: appended.data.message,
    })
  })
}
