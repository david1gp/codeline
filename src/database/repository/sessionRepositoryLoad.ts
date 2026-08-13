import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../databaseClient.js"
import { agentTable } from "../schema/agentTable.js"
import { serverTable } from "../schema/serverTable.js"
import { sessionTable } from "../schema/sessionTable.js"

export async function sessionRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<
  Result<{
    agent: typeof agentTable.$inferSelect
    server: typeof serverTable.$inferSelect
    session: typeof sessionTable.$inferSelect
  }>
> {
  const op = "sessionRepositoryLoad"

  try {
    const [row] = await database
      .select({ agent: agentTable, server: serverTable, session: sessionTable })
      .from(sessionTable)
      .innerJoin(serverTable, and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.ownerUserId, userId)))
      .innerJoin(
        agentTable,
        and(eq(sessionTable.primaryAgentId, agentTable.id), eq(agentTable.serverId, sessionTable.serverId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)

    if (row !== undefined) return createResult(row)
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be loaded.")
  }
}
