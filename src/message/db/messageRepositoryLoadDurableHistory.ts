import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { messageTable } from "./messageTable.js"

export async function messageRepositoryLoadDurableHistory(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<Result<Array<typeof messageTable.$inferSelect>>> {
  const op = "messageRepositoryLoadDurableHistory"

  try {
    const rows = await database
      .select({ message: messageTable })
      .from(messageTable)
      .innerJoin(sessionTable, and(eq(messageTable.sessionId, sessionTable.id), eq(sessionTable.userId, userId)))
      .where(and(eq(sessionTable.id, sessionId), isNotNull(messageTable.finalizedAt)))
      .orderBy(asc(messageTable.sequence), asc(messageTable.id))

    if (rows.length === 0) {
      const [session] = await database
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")
    }

    return createResult(rows.map((row) => row.message))
  } catch (_error) {
    return createResultError(op, "The durable message history could not be loaded.")
  }
}
