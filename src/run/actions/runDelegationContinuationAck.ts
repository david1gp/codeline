import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runDelegationTable } from "../db/runDelegationTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"

export type RunDelegationContinuationAckResult = {
  alreadyDelivered: boolean
  delegationId: string
  delivered: boolean
}

/**
 * Marks a background delegation's result as delivered to the parent session.
 * Only background delegations with a finalized result can be acknowledged;
 * the update is idempotent so retried acks (send succeeded, ack lost) simply
 * report `alreadyDelivered` instead of duplicating the continuation.
 */
export async function runDelegationContinuationAck(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  delegationId: string,
): Promise<Result<RunDelegationContinuationAckResult>> {
  const op = "runDelegationContinuationAck"
  if (delegationId.trim().length === 0)
    return runResultCreateError(op, "The delegation identifier is required.", runErrorCodes.identifiersRequired)
  try {
    const now = new Date()
    const [updated] = await database
      .update(runDelegationTable)
      .set({ continuationDeliveredAt: now, updatedAt: now })
      .where(
        and(
          eq(runDelegationTable.id, delegationId),
          eq(runDelegationTable.userId, userId),
          eq(runDelegationTable.sessionId, sessionId),
          eq(runDelegationTable.background, 1),
          isNotNull(runDelegationTable.finalizedResult),
          isNull(runDelegationTable.continuationDeliveredAt),
        ),
      )
      .returning({ id: runDelegationTable.id })
    if (updated !== undefined) return createResult({ alreadyDelivered: false, delegationId, delivered: true })

    const [existing] = await database
      .select({ id: runDelegationTable.id })
      .from(runDelegationTable)
      .where(
        and(
          eq(runDelegationTable.id, delegationId),
          eq(runDelegationTable.userId, userId),
          eq(runDelegationTable.sessionId, sessionId),
        ),
      )
      .limit(1)
    if (existing === undefined)
      return runResultCreateError(op, "The delegation could not be found.", runErrorCodes.delegationNotFound)
    return createResult({ alreadyDelivered: true, delegationId, delivered: true })
  } catch (_error) {
    return runResultCreateError(op, "The continuation could not be acknowledged.", runErrorCodes.persistFailed)
  }
}
