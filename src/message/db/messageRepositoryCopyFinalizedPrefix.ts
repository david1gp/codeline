import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { messageTable } from "./messageTable.js"

export async function messageRepositoryCopyFinalizedPrefix(
  database: DatabaseExecutor,
  userId: string,
  sourceSessionId: string,
  targetSessionId: string,
  messageId: string,
): Promise<Result<Array<typeof messageTable.$inferSelect>>> {
  const op = "messageRepositoryCopyFinalizedPrefix"
  const allowedRoles = ["user", "assistant"] as const

  return databaseExecutorTransactionRun(database, async (executor) => {
    try {
      const [target] = await executor
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, targetSessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (target === undefined) return createResultError(op, "The target session could not be found.")

      const [selected] = await executor
        .select({ message: messageTable })
        .from(messageTable)
        .innerJoin(sessionTable, eq(messageTable.sessionId, sessionTable.id))
        .where(
          and(
            eq(messageTable.id, messageId),
            eq(messageTable.sessionId, sourceSessionId),
            eq(sessionTable.id, sourceSessionId),
            eq(sessionTable.userId, userId),
            isNotNull(messageTable.finalizedAt),
            inArray(messageTable.role, allowedRoles),
          ),
        )
        .limit(1)

      if (selected === undefined) return createResultError(op, "The message could not be found.")

      const sourceMessages = await executor
        .select({ message: messageTable })
        .from(messageTable)
        .innerJoin(sessionTable, and(eq(messageTable.sessionId, sessionTable.id), eq(sessionTable.userId, userId)))
        .where(
          and(
            eq(messageTable.sessionId, sourceSessionId),
            lte(messageTable.sequence, selected.message.sequence),
            isNotNull(messageTable.finalizedAt),
            inArray(messageTable.role, allowedRoles),
          ),
        )
        .orderBy(asc(messageTable.sequence), asc(messageTable.id))

      const prefix = sourceMessages.map((row) => row.message)
      if (!prefix.some((message) => message.id === selected.message.id))
        return createResultError(op, "The finalized message prefix could not be loaded.")

      const copied = await executor
        .insert(messageTable)
        .values(
          prefix.map((message, index) => ({
            agentId: message.agentId,
            clientRequestId: message.clientRequestId,
            content: message.content,
            createdAt: message.createdAt,
            finalizedAt: message.finalizedAt,
            id: uuidv7(),
            metadata: message.metadata,
            role: message.role,
            sequence: index + 1,
            sessionId: targetSessionId,
          })),
        )
        .returning()

      if (copied.length !== prefix.length)
        return createResultError(op, "The finalized message prefix could not be copied.")
      return createResult(copied)
    } catch (_error) {
      return createResultError(op, "The finalized message prefix could not be copied.")
    }
  })
}
