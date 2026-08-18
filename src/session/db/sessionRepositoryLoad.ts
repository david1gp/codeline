import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
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
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
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
