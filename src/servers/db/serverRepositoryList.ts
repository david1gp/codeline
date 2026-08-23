import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, sql } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { serverTable } from "./serverTable.js"

export async function serverRepositoryList(
  database: DatabaseExecutor,
  organizationId: string,
  search?: string,
): Promise<Result<Array<typeof serverTable.$inferSelect>>> {
  const op = "serverRepositoryList"

  try {
    const conditions = [eq(serverTable.organizationId, organizationId)]
    if (search !== undefined) {
      const pattern = metadataSearchPatternCreate(search)
      conditions.push(sql`lower(${serverTable.name}) like lower(${pattern}) escape ${"\\"}`)
      conditions.push(sql`lower(${serverTable.metadata}) like lower(${pattern}) escape ${"\\"}`)
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
