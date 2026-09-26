import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { type RunActiveListResponse, runActiveListResponseSchema } from "../api/runActiveListResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runTable } from "./runTable.js"

const runActiveStatuses = ["accepted", "running"] as const

/**
 * Lists the session's non-terminal runs from one consistent database snapshot so
 * a reloaded tab can rejoin a detached run without holding client state.
 */
export async function runRepositoryActiveListLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<RunActiveListResponse>> {
  const op = "runRepositoryActiveListLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return runResultCreateError(op, "The authenticated run scope is required.", runErrorCodes.scopeRequired)
  if (sessionId.trim().length === 0)
    return runResultCreateError(op, "The session identifier is required.", runErrorCodes.sessionIdRequired)

  const loaded = await databaseReadTransactionRun(database, async (transaction) => {
    const [session] = await transaction
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined)
      return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

    const rows = await transaction
      .select({ id: runTable.id, status: runTable.status })
      .from(runTable)
      .where(
        and(
          eq(runTable.sessionId, sessionId),
          eq(runTable.userId, userId),
          inArray(runTable.status, runActiveStatuses),
        ),
      )
      .orderBy(asc(runTable.createdAt), asc(runTable.id))

    const response = v.safeParse(runActiveListResponseSchema, {
      runs: rows.map((row) => ({ runId: row.id, status: row.status })),
    })
    if (!response.success)
      return runResultCreateError(op, "The active run list is invalid.", runErrorCodes.activeListInvalid)
    return createResult(response.output)
  })
  if (!loaded.success) return loaded
  return loaded
}
