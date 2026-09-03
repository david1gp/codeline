import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import type { RunTranscript } from "../api/runTranscriptSchema.js"
import { attemptTable } from "../db/attemptTable.js"
import { runTable } from "../db/runTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runTranscriptBoundedCreate } from "./runTranscriptBoundedCreate.js"
import { runTranscriptProject } from "./runTranscriptProject.js"
import { runTranscriptToolDetailsProject } from "./runTranscriptToolDetailsProject.js"

type RunFinalizedDetailTerminalEvent = {
  eventType: "run-cancelled" | "run-completed" | "run-failed" | "run-interrupted"
  payload: Record<string, unknown>
}

type RunFinalizedDetailActiveSnapshot = {
  lastSequence: number
  partialText: string
}

export async function runFinalizedDetailCreate(
  transaction: DatabaseExecutor,
  userId: string,
  sessionId: string,
  runId: string,
  run: typeof runTable.$inferSelect,
  terminalEvent: RunFinalizedDetailTerminalEvent,
  assistantText?: string,
  activeSnapshot?: RunFinalizedDetailActiveSnapshot,
): Promise<
  Result<{
    tools: ReturnType<typeof runTranscriptToolDetailsProject>
    transcript: RunTranscript
  }>
> {
  const op = "runFinalizedDetailCreate"
  try {
    const attempts = await transaction
      .select({
        id: attemptTable.id,
        ordinal: attemptTable.ordinal,
        status: attemptTable.status,
        streamId: attemptTable.streamId,
      })
      .from(attemptTable)
      .where(and(eq(attemptTable.runId, runId), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)))
      .orderBy(asc(attemptTable.ordinal), asc(attemptTable.id))
    const events = await transaction
      .select({
        eventType: journalEventTable.eventType,
        id: journalEventTable.id,
        payload: journalEventTable.payload,
        runId: journalEventTable.runId,
        sequence: journalEventTable.sequence,
      })
      .from(journalEventTable)
      .where(and(eq(journalEventTable.userId, userId), eq(journalEventTable.runId, runId)))
      .orderBy(asc(journalEventTable.sequence), asc(journalEventTable.id))
    const terminalSequence = events.at(-1)?.sequence ?? 0
    const projected = runTranscriptProject({
      attempts,
      events: [
        ...events.map((event) => ({ ...event, runId: event.runId ?? runId })),
        {
          eventType: terminalEvent.eventType,
          id: runId,
          payload: terminalEvent.payload,
          runId,
          sequence: terminalSequence,
        },
      ],
      ...(activeSnapshot === undefined
        ? {}
        : {
            activeSnapshot: {
              failure: run.failure,
              lastSequence: activeSnapshot.lastSequence,
              partialText: activeSnapshot.partialText,
              status: run.status,
            },
          }),
      ...(assistantText === undefined ? {} : { finalizedAssistantText: assistantText }),
      includeToolCallIds: true,
      run: {
        cancellationKind: run.cancellationKind,
        failure: run.failure,
        id: run.id,
        sessionId: run.sessionId,
        status: run.status,
      },
    })
    if (!projected.success) return projected
    const transcript = runTranscriptBoundedCreate(projected.data)
    if (!transcript.success) return transcript
    return createResult({ transcript: transcript.data, tools: runTranscriptToolDetailsProject(runId, projected.data) })
  } catch (_error) {
    return runResultCreateError(
      op,
      "The finalized run detail could not be constructed.",
      runErrorCodes.providerOutputPersistFailed,
    )
  }
}
