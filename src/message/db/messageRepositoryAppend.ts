import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, max } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { messageTable } from "./messageTable.js"

export async function messageRepositoryAppend(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: {
    clientRequestId: string
    content: string
    role: "assistant" | "user"
  },
): Promise<Result<{ created: boolean; message: typeof messageTable.$inferSelect }>> {
  const op = "messageRepositoryAppend"

  try {
    const [session] = await database
      .select({ id: sessionTable.id, archivedAt: sessionTable.archivedAt, primaryAgentId: sessionTable.primaryAgentId })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .for("update")
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")
    if (session.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [existing] = await database
      .select()
      .from(messageTable)
      .where(and(eq(messageTable.sessionId, sessionId), eq(messageTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (existing !== undefined) {
      if (existing.role === input.role && existing.content === input.content) {
        return createResult({ created: false, message: existing })
      }
      return createResultError(op, "The message client request ID was already used with different content.")
    }

    const [last] = await database
      .select({ sequence: max(messageTable.sequence) })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .limit(1)
    const sequence = (last?.sequence ?? 0) + 1
    const [message] = await database
      .insert(messageTable)
      .values({
        agentId: session.primaryAgentId,
        clientRequestId: input.clientRequestId,
        content: input.content,
        id: uuidv7(),
        metadata: {},
        role: input.role,
        sequence,
        sessionId,
      })
      .returning()
    if (message === undefined) return createResultError(op, "The message could not be appended.")

    const [updatedSession] = await database
      .update(sessionTable)
      .set({ updatedAt: new Date() })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning({ id: sessionTable.id })
    if (updatedSession === undefined) return createResultError(op, "The session could not be updated.")

    return createResult({ created: true, message })
  } catch (_error) {
    return createResultError(op, "The message could not be appended.")
  }
}
