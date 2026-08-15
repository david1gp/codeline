import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "./serverTable.js"

export async function serverRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
): Promise<Result<typeof serverTable.$inferSelect>> {
  const op = "serverRepositoryLoad"

  try {
    const [server] = await database
      .select()
      .from(serverTable)
      .where(and(eq(serverTable.id, serverId), eq(serverTable.ownerUserId, userId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")
    return createResult(server)
  } catch (_error) {
    return createResultError(op, "The server could not be loaded.")
  }
}
