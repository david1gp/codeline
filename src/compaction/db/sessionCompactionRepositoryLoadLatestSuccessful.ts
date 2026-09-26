import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionCompactionTable } from "./sessionCompactionTable.js"

export async function sessionCompactionRepositoryLoadLatestSuccessful(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<typeof sessionCompactionTable.$inferSelect | undefined>> {
  const op = "sessionCompactionRepositoryLoadLatestSuccessful"

  try {
    const [session] = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    const [compaction] = await database
      .select()
      .from(sessionCompactionTable)
      .where(and(eq(sessionCompactionTable.sessionId, sessionId), eq(sessionCompactionTable.status, "succeeded")))
      .orderBy(desc(sessionCompactionTable.compactionVersion))
      .limit(1)
    return createResult(compaction)
  } catch (_error) {
    return createResultError(op, "The latest successful compaction could not be loaded.")
  }
}
