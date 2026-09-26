import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../../session/db/sessionHistoryEntryTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runDelegationTable } from "../db/runDelegationTable.js"
import { runHistoryToolEntryIdCreate } from "../db/runHistoryToolEntryIdCreate.js"
import { runToolDetailIdCreate } from "./runToolDetailIdCreate.js"

function runDelegationHistoryToolPayloadRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function runDelegationHistoryToolProjectionPersist(
  database: DatabaseExecutor,
  userId: string,
  parentSessionId: string,
  delegation: typeof runDelegationTable.$inferSelect,
): Promise<Result<void>> {
  try {
    const [existing] = await database
      .select()
      .from(sessionHistoryEntryTable)
      .where(
        and(
          eq(sessionHistoryEntryTable.userId, userId),
          eq(sessionHistoryEntryTable.sessionId, parentSessionId),
          eq(sessionHistoryEntryTable.sourceType, "tool"),
          eq(sessionHistoryEntryTable.sourceId, delegation.parentRunId),
          eq(sessionHistoryEntryTable.sourceDetailId, delegation.delegationKey),
        ),
      )
      .limit(1)

    const previous = runDelegationHistoryToolPayloadRecord(existing?.payload)
    const entryId = existing?.id ?? runHistoryToolEntryIdCreate(delegation.parentRunId, delegation.delegationKey)
    const detailId =
      typeof previous.detailId === "string"
        ? previous.detailId
        : runToolDetailIdCreate(delegation.parentRunId, delegation.delegationKey)
    const toolCallId = typeof previous.toolCallId === "string" ? previous.toolCallId : delegation.delegationKey
    const toolName = typeof previous.toolName === "string" ? previous.toolName : "delegate_task"
    const outcome = previous.outcome === "success" || previous.outcome === "error" ? previous.outcome : undefined
    const previousWithoutDelegationResult = { ...previous }
    delete previousWithoutDelegationResult.delegationResult
    const finalizedResult = delegation.finalizedResult
    const payload = {
      ...previousWithoutDelegationResult,
      ...(outcome === undefined ? {} : { outcome }),
      childRunId: delegation.childRunId,
      delegationId: delegation.id,
      delegationStatus: finalizedResult?.status ?? "accepted",
      detailId,
      id: entryId,
      kind: "tool" as const,
      parentSessionId,
      runId: delegation.parentRunId,
      summary: `${toolName} · ${outcome ?? "running"}`,
      toolCallId,
      toolName,
    }
    const saved = await sessionHistoryEntryRepositoryUpsert(database, userId, parentSessionId, {
      id: entryId,
      kind: "tool",
      payload,
      sourceDetailId: delegation.delegationKey,
      sourceId: delegation.parentRunId,
      sourceType: "tool",
    })
    if (!saved.success) return saved
    return createResult(undefined)
  } catch (_error) {
    return runResultCreateError(
      "runDelegationHistoryToolProjectionPersist",
      "The delegation tool history entry could not be saved.",
      runErrorCodes.persistFailed,
    )
  }
}
