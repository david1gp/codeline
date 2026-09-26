import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionDelegationReferencesLoad } from "../../session/db/sessionDelegationReferencesLoad.js"
import type { RunDelegationsResponse } from "../api/runDelegationsResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"

type RunDelegationsLoadResult = Pick<RunDelegationsResponse, "delegations" | "revision">

const runDelegationFinalizedResultSchema = v.nullable(runDelegationResultSchema)

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
    const loaded = await sessionDelegationReferencesLoad(database, userId, organizationId, sessionId)
    if (!loaded.success)
      return runResultCreateError(
        op,
        loaded.errorMessage,
        loaded.errorMessage.includes("could not be found")
          ? runErrorCodes.sessionNotFound
          : runErrorCodes.delegationsLoadFailed,
      )

    const delegations = [] as RunDelegationsResponse["delegations"]
    for (const { childSnapshot, childSessionId, delegation, parentSessionId } of loaded.data.delegations) {
      const finalizedResult = v.safeParse(runDelegationFinalizedResultSchema, delegation.finalizedResult)
      if (!finalizedResult.success)
        return runResultCreateError(
          op,
          "The persisted delegation result is invalid.",
          runErrorCodes.delegationsLoadFailed,
        )

      const childAgentId = runDelegationChildAgentIdResolve(childSnapshot)
      delegations.push({
        childSessionId,
        childRunId: delegation.childRunId,
        delegationId: delegation.id,
        delegationKey: delegation.delegationKey,
        finalizedResult: finalizedResult.output,
        id: delegation.id,
        parentAttemptId: delegation.parentAttemptId,
        parentRunId: delegation.parentRunId,
        parentSessionId,
        ...(childAgentId === undefined ? {} : { childAgentId }),
        task: delegation.task,
      })
    }

    return createResult({ delegations, revision: loaded.data.parentRevision })
  } catch (_error) {
    return runResultCreateError(op, "The delegations could not be loaded.", runErrorCodes.delegationsLoadFailed)
  }
}
