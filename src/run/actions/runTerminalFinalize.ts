import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor, DatabaseTransaction } from "../../database/databaseClient.js"
import type { journalEventsAppendPersist } from "../../journal/actions/journalEventsAppendPersist.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { journalRunDeltasDelete } from "../../journal/actions/journalRunDeltasDelete.js"
import { journalRunFinalize } from "../../journal/actions/journalRunFinalize.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runFinalizedDetailCreate } from "./runFinalizedDetailCreate.js"
import { runFinalizedToolProjectionPersist } from "./runFinalizedToolProjectionPersist.js"
import { runTransition } from "./runTransition.js"
import { attemptTable } from "../db/attemptTable.js"
import { runActiveStateRepositoryDelete } from "../db/runActiveStateRepositoryDelete.js"
import { runActiveStateTable } from "../db/runActiveStateTable.js"
import { runFinalizedDetailRepositoryUpsert } from "../db/runFinalizedDetailRepositoryUpsert.js"
import { runHistoryEntryPayloadCreate } from "../db/runHistoryEntryPayloadCreate.js"
import { runTable } from "../db/runTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"

type RunTerminalFinalizeInput = {
  failure?: { code: string; message: string }
  messageId?: string | null
  reason?: string
  status: "aborted" | "failed" | "succeeded"
}

type RunTerminalFinalizeResult = {
  attempt: typeof attemptTable.$inferSelect
  run: typeof runTable.$inferSelect
}

type RunTerminalFinalizeOptions = {
  journalEventsAppendPersist?: typeof journalEventsAppendPersist
  journalRunDeltasDelete?: typeof journalRunDeltasDelete
  runFinalizedDetailUpsert?: typeof runFinalizedDetailRepositoryUpsert
  runTransition?: typeof runTransition
}

function runTerminalFailureResolve(input: RunTerminalFinalizeInput): { code: string; message: string } | undefined {
  if (input.status !== "failed") return undefined
  return input.failure ?? { code: "provider_failed", message: "The provider failed." }
}

function runTerminalEventCreate(
  input: RunTerminalFinalizeInput,
  sessionRevision: number,
  runId: string,
  sessionId: string,
) {
  if (input.status === "succeeded")
    return {
      eventType: "run-completed" as const,
      payload: { messageId: input.messageId ?? null, runId, sessionId, sessionRevision },
    }
  if (input.status === "failed")
    return {
      eventType: "run-failed" as const,
      payload: { failure: runTerminalFailureResolve(input) ?? null, runId, sessionId, sessionRevision },
    }
  return {
    eventType: "run-cancelled" as const,
    payload: { ...(input.reason === undefined ? {} : { reason: input.reason }), runId, sessionId, sessionRevision },
  }
}

async function runTerminalSessionRevisionLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<Result<number>> {
  const op = "runTerminalFinalize"
  try {
    const [session] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined)
      return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)
    return createResult(session.revision)
  } catch (_error) {
    return runResultCreateError(op, "The session revision could not be loaded.", runErrorCodes.sessionUpdateFailed)
  }
}

function runTerminalRecipientResolve(userId: string) {
  return async (transaction: DatabaseTransaction, resource: { resourceId: string; resourceType: string }) => {
    const op = "runTerminalRecipientResolve"
    if (resource.resourceType !== "run")
      return runResultCreateError(op, "The run journal resource is invalid.", runErrorCodes.journalResourceInvalid)
    try {
      const [run] = await transaction
        .select({ userId: runTable.userId })
        .from(runTable)
        .where(and(eq(runTable.id, resource.resourceId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined)
        return runResultCreateError(op, "The run journal resource could not be authorized.", runErrorCodes.notFound)
      return createResult([run.userId])
    } catch (_error) {
      return runResultCreateError(
        op,
        "The run journal recipient could not be resolved.",
        runErrorCodes.journalRecipientFailed,
      )
    }
  }
}

export async function runTerminalFinalize(
  input: {
    database: DatabaseExecutor
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    runId: string
    sessionId: string
    userId: string
  },
  terminal: RunTerminalFinalizeInput,
  options: RunTerminalFinalizeOptions = {},
): Promise<Result<RunTerminalFinalizeResult>> {
  const failure = runTerminalFailureResolve(terminal)
  const terminalEvent = await runTerminalSessionRevisionLoad(input.database, input.userId, input.sessionId)
  if (!terminalEvent.success) return terminalEvent
  const event = runTerminalEventCreate(terminal, terminalEvent.data, input.runId, input.sessionId)
  const transitionRun = options.runTransition ?? runTransition
  const finalizedDetailUpsert = options.runFinalizedDetailUpsert ?? runFinalizedDetailRepositoryUpsert
  const finalizer = journalRunFinalize({
    database: input.database,
    ...(options.journalEventsAppendPersist === undefined ? {} : { appendPersist: options.journalEventsAppendPersist }),
    ...(options.journalRunDeltasDelete === undefined ? {} : { runDeltasDelete: options.journalRunDeltasDelete }),
    postCommitPublish: input.journalPostCommitPublish,
    resolveRecipients: runTerminalRecipientResolve(input.userId),
  })
  let terminalChangePosition: number | undefined

  return finalizer.finalize(
    {
      runId: input.runId,
      terminalEvent: () => ({ ...event, payload: { ...event.payload, changePosition: terminalChangePosition } }),
    },
    async (transaction): Promise<Result<RunTerminalFinalizeResult>> => {
      const [activeState] = await transaction
        .select({ lastSequence: runActiveStateTable.lastSequence, partialText: runActiveStateTable.partialText })
        .from(runActiveStateTable)
        .where(
          and(
            eq(runActiveStateTable.runId, input.runId),
            eq(runActiveStateTable.sessionId, input.sessionId),
            eq(runActiveStateTable.userId, input.userId),
          ),
        )
        .limit(1)
      const transitioned = await transitionRun(
        transaction,
        input.userId,
        input.sessionId,
        input.runId,
        terminal.status === "failed"
          ? { failure: failure ?? { code: "provider_failed", message: "The provider failed." }, status: "failed" }
          : { status: terminal.status },
      )
      if (!transitioned.success) return transitioned

      const historyEntry = await sessionHistoryEntryRepositoryUpsert(transaction, input.userId, input.sessionId, {
        id: transitioned.data.run.id,
        kind: "run",
        payload: runHistoryEntryPayloadCreate({
          id: transitioned.data.run.id,
          status: terminal.status,
          terminalKind:
            terminal.status === "succeeded" ? "completed" : terminal.status === "failed" ? "failed" : "cancelled",
        }),
        sourceId: transitioned.data.run.id,
        sourceType: "run",
      })
      if (!historyEntry.success) return historyEntry
      terminalChangePosition = historyEntry.data.entry.changePosition
      const detail = await runFinalizedDetailCreate(
        transaction,
        input.userId,
        input.sessionId,
        input.runId,
        transitioned.data.run,
        event,
        undefined,
        activeState,
      )
      if (!detail.success) return detail
      const projectedTools = await runFinalizedToolProjectionPersist(
        transaction,
        input.userId,
        input.sessionId,
        input.runId,
        detail.data.tools,
      )
      if (!projectedTools.success) return projectedTools
      const persistedDetail = await finalizedDetailUpsert(transaction, input.userId, input.sessionId, input.runId, {
        tools: detail.data.tools,
        transcript: detail.data.transcript,
      })
      if (!persistedDetail.success) return persistedDetail
      const clearedActiveState = await runActiveStateRepositoryDelete(
        transaction,
        input.userId,
        input.sessionId,
        input.runId,
      )
      if (!clearedActiveState.success) return clearedActiveState
      return createResult({ attempt: transitioned.data.attempt, run: transitioned.data.run })
    },
  )
}
