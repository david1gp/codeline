import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, ilike, sql } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { agentTable } from "./agentTable.js"

export async function agentRepositoryList(
  database: DatabaseExecutor,
  organizationId: string,
  serverId: string,
  search?: string,
): Promise<Result<Array<{ agent: typeof agentTable.$inferSelect; server: typeof serverTable.$inferSelect }>>> {
  const op = "agentRepositoryList"

  try {
    const [server] = await database
      .select()
      .from(serverTable)
      .where(and(eq(serverTable.id, serverId), eq(serverTable.organizationId, organizationId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const conditions = [eq(serverTable.organizationId, organizationId), eq(agentTable.serverId, serverId)]
    if (search !== undefined) {
      const pattern = metadataSearchPatternCreate(search)
      conditions.push(ilike(agentTable.name, pattern))
      conditions.push(ilike(agentTable.role, pattern))
      conditions.push(ilike(sql<string>`${agentTable.configuration}::text`, pattern))
    }

    const agents = await database
      .select({ agent: agentTable, server: serverTable })
      .from(agentTable)
      .innerJoin(serverTable, eq(agentTable.serverId, serverTable.id))
      .where(and(...conditions))
      .orderBy(asc(agentTable.sortOrder), asc(agentTable.name), asc(agentTable.id))

    return createResult(agents)
  } catch (_error) {
    return createResultError(op, "The agents could not be loaded.")
  }
}
