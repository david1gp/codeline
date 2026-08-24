import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { RunDelegationsResponse } from "../api/runDelegationsResponseSchema.js"
import { runDelegationTable } from "./runDelegationTable.js"

type RunDelegationsLoadResult = Pick<RunDelegationsResponse, "delegations" | "revision">

export async function runRepositoryDelegationsLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<RunDelegationsLoadResult>> {
  const op = "runRepositoryDelegationsLoad"

  try {
    const [authorizedSession] = await database
      .select({ id: sessionTable.id, revision: sessionTable.revision })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (authorizedSession === undefined) return createResultError(op, "The session could not be found.")

    const delegations = await database
      .select({
        childRunId: runDelegationTable.childRunId,
        delegationKey: runDelegationTable.delegationKey,
        id: runDelegationTable.id,
        parentAttemptId: runDelegationTable.parentAttemptId,
        parentRunId: runDelegationTable.parentRunId,
        task: runDelegationTable.task,
      })
      .from(runDelegationTable)
      .where(and(eq(runDelegationTable.sessionId, sessionId), eq(runDelegationTable.userId, userId)))
      .orderBy(asc(runDelegationTable.createdAt), asc(runDelegationTable.id))

    return createResult({ delegations, revision: authorizedSession.revision })
  } catch (_error) {
    return createResultError(op, "The delegations could not be loaded.")
  }
}
