import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { journalEventTable } from "../../journal/db/journalEventTable.js"
import { messageTable } from "../../message/db/messageTable.js"
import { runTranscriptProject } from "../../run/actions/runTranscriptProject.js"
import { runTranscriptToolDetailsProject } from "../../run/actions/runTranscriptToolDetailsProject.js"
import type { attemptTable } from "../../run/db/attemptTable.js"
import type { runTable } from "../../run/db/runTable.js"
import type { SessionChildReference } from "../api/sessionChildReferenceSchema.js"
import { type SessionSemanticStep, sessionSemanticStepSchema } from "../api/sessionSemanticStepSchema.js"
import { sessionBoundedDelegationToolKeyCreate } from "./sessionBoundedDelegationToolKeyCreate.js"

type SessionBoundedSemanticStepsInput = {
  attempts: ReadonlyArray<typeof attemptTable.$inferSelect>
  events: ReadonlyArray<typeof journalEventTable.$inferSelect>
  maxSequence?: number
  messages: ReadonlyArray<typeof messageTable.$inferSelect>
  delegationReferences?: ReadonlyMap<string, SessionChildReference | null>
  runs: ReadonlyArray<typeof runTable.$inferSelect>
}

const sessionBoundedSemanticStepSummaryLimit = 16_384

function sessionBoundedSemanticStepSummary(content: string): string {
  return content.slice(0, sessionBoundedSemanticStepSummaryLimit)
}

function sessionBoundedRunSummary(status: typeof runTable.$inferSelect.status): string {
  if (status === "accepted") return "Run accepted"
  if (status === "running") return "Run running"
  if (status === "succeeded") return "Run completed"
  if (status === "failed") return "Run failed"
  return "Run aborted"
}

function sessionBoundedSemanticStepCompare(left: SessionSemanticStep, right: SessionSemanticStep): number {
  return left.sequence - right.sequence || left.id.localeCompare(right.id)
}

function sessionBoundedMessageStepsCreate(
  messages: ReadonlyArray<typeof messageTable.$inferSelect>,
): Result<Array<SessionSemanticStep>> {
  const op = "sessionBoundedSemanticStepsCreate"
  const steps: Array<SessionSemanticStep> = []
  for (const message of messages) {
    const role = v.safeParse(v.picklist(["assistant", "user"]), message.role)
    if (!role.success) return createResultError(op, "The persisted message role is invalid.")
    const parsed = v.safeParse(sessionSemanticStepSchema, {
      id: message.id,
      kind: "message",
      role: role.output,
      sequence: message.sequence,
      summary: sessionBoundedSemanticStepSummary(message.content),
    })
    if (!parsed.success) return createResultError(op, "The persisted message semantic step is invalid.")
    steps.push(parsed.output)
  }
  return createResult(steps)
}

export function sessionBoundedSemanticStepsCreate(
  input: SessionBoundedSemanticStepsInput,
): Result<Array<SessionSemanticStep>> {
  const op = "sessionBoundedSemanticStepsCreate"
  const messageSteps = sessionBoundedMessageStepsCreate(input.messages)
  if (!messageSteps.success) return messageSteps
  const steps = [...messageSteps.data]
  const attemptsByRun = new Map<string, Array<typeof attemptTable.$inferSelect>>()
  for (const attempt of input.attempts) {
    const current = attemptsByRun.get(attempt.runId) ?? []
    current.push(attempt)
    attemptsByRun.set(attempt.runId, current)
  }
  const eventsByRun = new Map<string, Array<typeof journalEventTable.$inferSelect>>()
  for (const event of input.events) {
    if (event.runId === null) continue
    if (input.maxSequence !== undefined && event.sequence > input.maxSequence) continue
    const current = eventsByRun.get(event.runId) ?? []
    current.push(event)
    eventsByRun.set(event.runId, current)
  }

  for (const run of input.runs) {
    const events = eventsByRun.get(run.id) ?? []
    // A run without an event visible at this watermark has no valid timeline sequence.
    // Active-run state still carries an accepted or running run until its tail arrives.
    if (events.length === 0) continue
    let toolDetails = [] as ReturnType<typeof runTranscriptToolDetailsProject>
    const transcript = runTranscriptProject({
      attempts: attemptsByRun.get(run.id) ?? [],
      events,
      includeToolCallIds: true,
      run,
    })
    if (!transcript.success) return createResultError(op, transcript.errorMessage)
    toolDetails = runTranscriptToolDetailsProject(run.id, transcript.data)
    const runStep = v.safeParse(sessionSemanticStepSchema, {
      detailId: run.id,
      id: run.id,
      kind: "run",
      sequence: events[0]?.sequence ?? 0,
      summary: sessionBoundedRunSummary(run.status),
    })
    if (!runStep.success) return createResultError(op, "The persisted run semantic step is invalid.")
    steps.push(runStep.output)

    for (const tool of toolDetails) {
      const status = tool.outcome === undefined ? "running" : tool.outcome
      const name = tool.toolName === undefined ? "Tool" : tool.toolName
      const toolStep = v.safeParse(sessionSemanticStepSchema, {
        ...(input.delegationReferences?.has(sessionBoundedDelegationToolKeyCreate(run.id, tool.detailId))
          ? {
              childReference: input.delegationReferences.get(
                sessionBoundedDelegationToolKeyCreate(run.id, tool.detailId),
              ),
            }
          : {}),
        detailId: tool.detailId,
        id: tool.detailId,
        kind: "tool",
        runId: run.id,
        sequence: tool.sequence,
        summary: sessionBoundedSemanticStepSummary(`${name} · ${status}`),
      })
      if (!toolStep.success) return createResultError(op, "The persisted tool semantic step is invalid.")
      steps.push(toolStep.output)
    }
  }

  return createResult(steps.sort(sessionBoundedSemanticStepCompare))
}
