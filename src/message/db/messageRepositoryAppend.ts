import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, max, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { messageMetadataSchema } from "../schema/messageMetadataSchema.js"
import { messageTable } from "./messageTable.js"

export async function messageRepositoryAppend(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: {
    clientRequestId: string
    content: string
    metadata?: unknown
    role: "assistant" | "user"
  },
): Promise<Result<{ created: boolean; message: typeof messageTable.$inferSelect }>> {
  const op = "messageRepositoryAppend"
  const metadata = v.safeParse(messageMetadataSchema, input.metadata ?? {})
  if (!metadata.success) return createResultError(op, "The message metadata is invalid.")

  return databaseExecutorTransactionRun<{ created: boolean; message: typeof messageTable.$inferSelect }>(
    database,
    async (executor) => {
      try {
        const [session] = await executor
          .select({
            id: sessionTable.id,
            archivedAt: sessionTable.archivedAt,
            primaryAgentId: sessionTable.primaryAgentId,
          })
          .from(sessionTable)
          .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
          .limit(1)
        if (session === undefined) return createResultError(op, "The session could not be found.")
        if (session.archivedAt !== null) return createResultError(op, "The session is archived.")

        const [existing] = await executor
          .select()
          .from(messageTable)
          .where(and(eq(messageTable.sessionId, sessionId), eq(messageTable.clientRequestId, input.clientRequestId)))
          .limit(1)
        if (existing !== undefined) {
          if (
            existing.role === input.role &&
            existing.content === input.content &&
            JSON.stringify(existing.metadata) === JSON.stringify(metadata.output)
          ) {
            return createResult({ created: false, message: existing })
          }
          return createResultError(op, "The message client request ID was already used with different content.")
        }

        const [last] = await executor
          .select({ sequence: max(messageTable.sequence) })
          .from(messageTable)
          .where(eq(messageTable.sessionId, sessionId))
          .limit(1)
        const sequence = (last?.sequence ?? 0) + 1
        const [message] = await executor
          .insert(messageTable)
          .values({
            agentId: session.primaryAgentId,
            clientRequestId: input.clientRequestId,
            content: input.content,
            id: uuidv7(),
            metadata: metadata.output,
            role: input.role,
            sequence,
            sessionId,
          })
          .returning()
        if (message === undefined) return createResultError(op, "The message could not be appended.")

        const [updatedSession] = await executor
          .update(sessionTable)
          .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: new Date() })
          .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
          .returning({ id: sessionTable.id })
        if (updatedSession === undefined) return createResultError(op, "The session could not be updated.")

        return createResult({ created: true, message })
      } catch (_error) {
        return createResultError(op, "The message could not be appended.")
      }
    },
  )
}
