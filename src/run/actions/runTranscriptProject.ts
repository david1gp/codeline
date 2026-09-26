import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { journalEventSchema } from "../../stream/schema/journalEventSchema.js"
import { executionTranscriptProject } from "./executionTranscriptProject.js"
import { attemptStatusSchema } from "../schema/attemptStatusSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

type RunTranscriptProjectInput = {
  attempts: ReadonlyArray<{ id?: string; ordinal: number; status: unknown; streamId: string }>
  events: ReadonlyArray<{ eventType: string; id: string; payload: unknown; runId: string | null; sequence: number }>
  finalizedAssistantText?: string
  includeToolCallIds?: boolean
  run: {
    cancellationKind: unknown
    failure: unknown
    id: string
    sessionId: string
    status: unknown
  }
}

function objectRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  return input as Record<string, unknown>
}

function runTranscriptJournalEventProject(
  input: RunTranscriptProjectInput["events"][number],
  run: RunTranscriptProjectInput["run"],
): Result<{ eventType: string; payload: unknown; sequence: number }> {
  const op = "runTranscriptProject"
  const payload = objectRecord(input.payload)
  if (payload === undefined) return createResultError(op, "The persisted run event payload is invalid.")
  const parsed = v.safeParse(journalEventSchema, {
    ...payload,
    eventType: input.eventType,
    id: input.id,
    sequence: input.sequence,
  })
  if (!parsed.success) return createResultError(op, "The persisted run event is invalid.")

  const parsedRecord = parsed.output as Record<string, unknown>
  if (parsedRecord.runId !== run.id || parsedRecord.sessionId !== run.sessionId)
    return createResultError(op, "The persisted run event belongs to another run.")
  const { eventType, id: _id, sequence: _sequence, ...eventPayload } = parsedRecord
  return createResult({ eventType: String(eventType), payload: eventPayload, sequence: input.sequence })
}

export function runTranscriptProject(
  input: RunTranscriptProjectInput,
): Result<ReturnType<typeof executionTranscriptProject>> {
  const op = "runTranscriptProject"
  const status = v.safeParse(runStatusSchema, input.run.status)
  if (!status.success) return createResultError(op, "The persisted run status is invalid.")
  const cancellationKind = v.safeParse(v.nullable(runCancellationKindSchema), input.run.cancellationKind)
  if (!cancellationKind.success) return createResultError(op, "The persisted run cancellation state is invalid.")
  const failure = v.safeParse(v.nullable(runFailureMetadataSchema), input.run.failure)
  if (!failure.success) return createResultError(op, "The persisted run failure state is invalid.")

  const attempts: Array<{ ordinal: number; status: v.InferOutput<typeof attemptStatusSchema>; streamId: string }> = []
  for (const attempt of input.attempts) {
    const attemptStatus = v.safeParse(attemptStatusSchema, attempt.status)
    if (!attemptStatus.success) return createResultError(op, "The persisted run attempt status is invalid.")
    attempts.push({ ordinal: attempt.ordinal, status: attemptStatus.output, streamId: attempt.streamId })
  }

  const events: Array<{
    attemptOrdinal: number
    event: { eventType: string; payload: unknown }
    sequence: number
    streamId: string
  }> = []
  const authoritativeAttempt = attempts.at(-1)
  for (const source of input.events) {
    const projected = runTranscriptJournalEventProject(source, input.run)
    if (!projected.success) return projected
    events.push({
      attemptOrdinal: authoritativeAttempt?.ordinal ?? 1,
      event: { eventType: projected.data.eventType, payload: projected.data.payload },
      sequence: projected.data.sequence,
      streamId: authoritativeAttempt?.streamId ?? "transcript",
    })
  }

  return createResult(
    executionTranscriptProject({
      attempts,
      events,
      ...(input.finalizedAssistantText === undefined ? {} : { finalizedAssistantText: input.finalizedAssistantText }),
      includeToolCallIds: input.includeToolCallIds,
      run: { cancellationKind: cancellationKind.output, failure: failure.output, status: status.output },
    }),
  )
}
