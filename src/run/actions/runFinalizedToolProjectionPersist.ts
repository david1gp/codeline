import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseTransaction } from "../../database/databaseClient.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../../session/db/sessionHistoryEntryTable.js"
import type { RunToolDetail } from "../api/runToolDetailSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runHistoryToolEntryIdCreate } from "../db/runHistoryToolEntryIdCreate.js"

export async function runFinalizedToolProjectionPersist(
  transaction: DatabaseTransaction,
  userId: string,
  sessionId: string,
  runId: string,
  tools: ReadonlyArray<RunToolDetail>,
): Promise<Result<void>> {
  try {
    for (const tool of tools) {
      const previousEntry = await transaction
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.userId, userId),
            eq(sessionHistoryEntryTable.sessionId, sessionId),
            eq(sessionHistoryEntryTable.sourceType, "tool"),
            eq(sessionHistoryEntryTable.sourceId, runId),
            eq(sessionHistoryEntryTable.sourceDetailId, tool.toolCallId),
          ),
        )
        .limit(1)
      const entryId = previousEntry[0]?.id ?? runHistoryToolEntryIdCreate(runId, tool.toolCallId)
      const previousPayload =
        previousEntry[0]?.payload !== null &&
        typeof previousEntry[0]?.payload === "object" &&
        !Array.isArray(previousEntry[0]?.payload)
          ? (previousEntry[0]?.payload as Record<string, unknown>)
          : {}
      const toolName = tool.toolName
      const status = tool.outcome ?? "running"
      const projected = await sessionHistoryEntryRepositoryUpsert(transaction, userId, sessionId, {
        id: entryId,
        kind: "tool",
        payload: {
          detailId: tool.detailId,
          id: entryId,
          kind: "tool",
          ...(tool.outcome === undefined ? {} : { outcome: tool.outcome }),
          ...(tool.output === undefined
            ? {}
            : { outputAvailable: true, outputTruncated: tool.outputTruncated ?? false }),
          ...(tool.result === undefined
            ? {}
            : { resultAvailable: true, resultTruncated: tool.resultTruncated ?? false }),
          runId,
          sequence: tool.sequence,
          summary: `${toolName ?? "Tool"} · ${status}`,
          toolCallId: tool.toolCallId,
          ...(toolName === undefined ? {} : { toolName }),
          ...(tool.workingDirectory === undefined ? {} : { workingDirectory: tool.workingDirectory }),
          ...(typeof previousPayload.delegationId === "string" &&
          typeof previousPayload.parentSessionId === "string" &&
          typeof previousPayload.childRunId === "string" &&
          typeof previousPayload.delegationStatus === "string"
            ? {
                childRunId: previousPayload.childRunId,
                delegationId: previousPayload.delegationId,
                delegationStatus: previousPayload.delegationStatus,
                parentSessionId: previousPayload.parentSessionId,
              }
            : {}),
        },
        sourceDetailId: tool.toolCallId,
        sourceId: runId,
        sourceType: "tool",
      })
      if (!projected.success) return projected
    }
  } catch (_error) {
    return runResultCreateError(
      "runFinalizedToolProjectionPersist",
      "The finalized tool projection could not be saved.",
      runErrorCodes.providerOutputPersistFailed,
    )
  }
  return createResult(undefined)
}
