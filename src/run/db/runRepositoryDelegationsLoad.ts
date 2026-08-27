import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { RunDelegationsResponse } from "../api/runDelegationsResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runTable } from "./runTable.js"

type RunDelegationsLoadResult = Pick<RunDelegationsResponse, "delegations" | "revision">

function runDelegationChildAgentIdResolve(snapshot: unknown): string | undefined {
  if (typeof snapshot !== "object" || snapshot === null) return undefined
  const target = (snapshot as Record<string, unknown>).target
  if (typeof target !== "object" || target === null) return undefined
  const agentId = (target as Record<string, unknown>).agentId
  if (typeof agentId !== "string") return undefined
  const normalized = agentId.trim()
  return normalized.length === 0 ? undefined : normalized
}

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
    if (authorizedSession === undefined)
      return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

    const rows = await database
      .select({
        childRunId: runDelegationTable.childRunId,
        childSnapshot: runTable.snapshot,
        delegationKey: runDelegationTable.delegationKey,
        id: runDelegationTable.id,
        parentAttemptId: runDelegationTable.parentAttemptId,
        parentRunId: runDelegationTable.parentRunId,
        task: runDelegationTable.task,
      })
      .from(runDelegationTable)
      .leftJoin(runTable, eq(runTable.id, runDelegationTable.childRunId))
      .where(and(eq(runDelegationTable.sessionId, sessionId), eq(runDelegationTable.userId, userId)))
      .orderBy(asc(runDelegationTable.createdAt), asc(runDelegationTable.id))

    const delegations = rows.map(({ childSnapshot, ...delegation }) => {
      const childAgentId = runDelegationChildAgentIdResolve(childSnapshot)
      return childAgentId === undefined ? delegation : { ...delegation, childAgentId }
    })

    return createResult({ delegations, revision: authorizedSession.revision })
  } catch (_error) {
    return runResultCreateError(op, "The delegations could not be loaded.", runErrorCodes.delegationsLoadFailed)
  }
}
