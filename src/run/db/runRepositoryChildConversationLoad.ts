import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { organizationTable } from "../../identity/db/organizationTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { RunDetailResponse } from "../api/runDetailResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runRepositoryDetailLoad } from "./runRepositoryDetailLoad.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

export async function runRepositoryChildConversationLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  parentSessionId: string,
  childRunId: string,
  delegationId: string,
): Promise<Result<RunDetailResponse>> {
  const op = "runRepositoryChildConversationLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return createResultErrorCode(op, "The authenticated run scope is required.", runErrorCodes.scopeRequired)
  if (parentSessionId.trim().length === 0 || childRunId.trim().length === 0 || delegationId.trim().length === 0)
    return createResultErrorCode(
      op,
      "The parent session, child run, and delegation identifiers are required.",
      runErrorCodes.identifiersRequired,
    )

  try {
    const authorized = await databaseReadTransactionRun(database, async (transaction) => {
      const [row] = await transaction
        .select({ childRunId: runTable.id })
        .from(runDelegationTable)
        .innerJoin(
          runTable,
          and(
            eq(runTable.id, runDelegationTable.childRunId),
            eq(runTable.sessionId, parentSessionId),
            eq(runTable.userId, userId),
          ),
        )
        .innerJoin(
          sessionTable,
          and(eq(sessionTable.id, runDelegationTable.sessionId), eq(sessionTable.userId, userId)),
        )
        .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
        .innerJoin(
          organizationTable,
          and(eq(serverTable.organizationId, organizationTable.id), eq(organizationTable.id, organizationId)),
        )
        .where(
          and(
            eq(runDelegationTable.id, delegationId),
            eq(runDelegationTable.childRunId, childRunId),
            eq(runDelegationTable.sessionId, parentSessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
        .limit(1)
      if (row === undefined)
        return createResultErrorCode(op, "The child conversation could not be found.", runErrorCodes.notFound)
      return createResult(row.childRunId)
    })
    if (!authorized.success) return authorized
    return runRepositoryDetailLoad(database, userId, organizationId, parentSessionId, authorized.data)
  } catch (_error) {
    return createResultErrorCode(op, "The child conversation could not be loaded.", runErrorCodes.persistFailed)
  }
}
