import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, ilike, sql } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { serverTable } from "./serverTable.js"

export async function serverRepositoryList(
  database: DatabaseExecutor,
  userId: string,
  search?: string,
): Promise<Result<Array<typeof serverTable.$inferSelect>>> {
  const op = "serverRepositoryList"

  try {
    const conditions = [eq(serverTable.ownerUserId, userId)]
    if (search !== undefined) {
      const pattern = metadataSearchPatternCreate(search)
      conditions.push(ilike(serverTable.name, pattern))
      conditions.push(ilike(sql<string>`${serverTable.metadata}::text`, pattern))
    }

    const servers = await database
      .select()
      .from(serverTable)
      .where(and(...conditions))
      .orderBy(asc(serverTable.name), asc(serverTable.id))

    return createResult(servers)
  } catch (_error) {
    return createResultError(op, "The servers could not be loaded.")
  }
}
