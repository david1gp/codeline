import * as v from "valibot"
import {
  type ExecutionStreamEvent,
  executionStreamEventSchema,
} from "../../stream/schema/executionStreamEventSchema.js"
import type { StreamProducerDelta } from "../../stream/schema/streamProducerDeltaSchema.js"
import { streamProducerDeltaSchema } from "../../stream/schema/streamProducerDeltaSchema.js"
import type { RunActiveSnapshotResponse } from "../api/runActiveSnapshotResponseSchema.js"
import { executionTranscriptNormalize } from "./executionTranscriptNormalize.js"

type ExecutionTranscriptNormalizeInput = Parameters<typeof executionTranscriptNormalize>[0]
type ExecutionTranscriptEvent = ExecutionTranscriptNormalizeInput["events"][number]
type ExecutionTranscriptAttempt = NonNullable<ExecutionTranscriptNormalizeInput["attempts"]>[number]
type ExecutionTranscriptRun = NonNullable<ExecutionTranscriptNormalizeInput["run"]>
type ExecutionTranscriptSourceEvent = {
  attemptOrdinal?: number
  event: unknown
  sequence?: number
  streamId?: string
}
type ExecutionTranscriptProjectInput = {
  activeSnapshot?: Pick<RunActiveSnapshotResponse, "failure" | "lastSequence" | "partialText" | "status">
  attempts?: ReadonlyArray<ExecutionTranscriptAttempt>
  backlog?: ReadonlyArray<ExecutionTranscriptSourceEvent>
  events?: ReadonlyArray<ExecutionTranscriptSourceEvent>
  finalizedAssistantText?: string
  includeToolCallIds?: boolean
  run?: ExecutionTranscriptRun
  streamEnded?: boolean
}

function objectRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  return input as Record<string, unknown>
}

function sourceEventValue(input: ExecutionTranscriptSourceEvent): unknown {
  const record = objectRecord(input.event)
  if (record?.data !== undefined && record.eventType === undefined) return record.data
  return input.event
}

function sourceEventSequence(input: ExecutionTranscriptSourceEvent): number | undefined {
  if (input.sequence !== undefined) return input.sequence
  const record = objectRecord(sourceEventValue(input))
  return typeof record?.sequence === "number" ? record.sequence : undefined
}

function executionStreamEventParse(input: unknown): ExecutionStreamEvent | undefined {
  const parsed = v.safeParse(executionStreamEventSchema, input)
  return parsed.success ? parsed.output : undefined
}

function executionTranscriptToolEventProject(input: StreamProducerDelta): ExecutionStreamEvent | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.delta)
  } catch (_error) {
    return undefined
  }
  const record = objectRecord(parsed)
  if (record === undefined) return undefined

  const nestedPayload = objectRecord(record.payload)
  if (typeof record.eventType === "string") {
    const event = executionStreamEventParse({
      eventType: record.eventType,
      payload: nestedPayload ?? record,
    })
    if (event !== undefined) return event
  }

  const toolCallId = record.toolCallId
  if (typeof toolCallId !== "string") return undefined
  if (typeof record.toolName === "string")
    return executionStreamEventParse({
      eventType: "tool_start",
      payload: { toolCallId, toolName: record.toolName },
    })
  if (typeof record.output === "string")
    return executionStreamEventParse({
      eventType: "tool_output",
      payload: { output: record.output, toolCallId, truncated: record.truncated === true },
    })
  if (typeof record.result === "string" && (record.outcome === "success" || record.outcome === "error"))
    return executionStreamEventParse({
      eventType: "tool_result",
      payload: {
        outcome: record.outcome,
        result: record.result,
        toolCallId,
        truncated: record.truncated === true,
        ...(typeof record.workingDirectory === "string" ? { workingDirectory: record.workingDirectory } : {}),
      },
    })
  return undefined
}

function executionTranscriptDeltaProject(input: StreamProducerDelta): ExecutionStreamEvent | StreamProducerDelta {
  if (input.deltaKind === "text") return { eventType: "text_delta", payload: { delta: input.delta } }
  if (input.deltaKind === "thinking" && (input.delta === "started" || input.delta === "finished"))
    return { eventType: "thinking_status", payload: { status: input.delta } }
  if (input.deltaKind === "tool") return executionTranscriptToolEventProject(input) ?? input
  return input
}

function executionTranscriptEventProject(input: ExecutionTranscriptSourceEvent): ExecutionTranscriptEvent {
  const source = sourceEventValue(input)
  const sourceRecord = objectRecord(source)
  const durablePayload = sourceRecord?.eventType === "delta" ? sourceRecord.payload : undefined
  const delta = v.safeParse(streamProducerDeltaSchema, durablePayload ?? source)
  const event = delta.success ? executionTranscriptDeltaProject(delta.output) : source
  const sequence = sourceEventSequence(input)
  return {
    attemptOrdinal: input.attemptOrdinal ?? 1,
    event: event as ExecutionTranscriptEvent["event"],
    ...(sequence === undefined ? {} : { sequence }),
    streamId: input.streamId ?? "transcript",
  }
}

function executionTranscriptEventIsText(input: ExecutionTranscriptEvent): boolean {
  const record = objectRecord(input.event)
  if (record?.eventType === "text_delta") return true
  return record?.deltaKind === "text"
}

function executionTranscriptEventSequence(input: ExecutionTranscriptEvent): number | undefined {
  if (input.sequence !== undefined) return input.sequence
  const record = objectRecord(input.event)
  return typeof record?.sequence === "number" ? record.sequence : undefined
}

function executionTranscriptAttemptResolve(
  attempts: ReadonlyArray<ExecutionTranscriptAttempt> | undefined,
  events: ReadonlyArray<ExecutionTranscriptEvent>,
): { attemptOrdinal: number; streamId: string } {
  const latest = [...(attempts ?? [])].sort((left, right) => left.ordinal - right.ordinal).at(-1)
  if (latest !== undefined) return { attemptOrdinal: latest.ordinal, streamId: latest.streamId }
  const event = events.at(-1)
  return {
    attemptOrdinal: event?.attemptOrdinal ?? 1,
    streamId: event?.streamId ?? "transcript",
  }
}

function executionTranscriptTerminalSequenceResolve(
  events: ReadonlyArray<ExecutionTranscriptEvent>,
): number | undefined {
  const terminalSequences = events
    .filter((event) => {
      const eventType = objectRecord(event.event)?.eventType
      return eventType === "terminal" || (typeof eventType === "string" && eventType.startsWith("run-"))
    })
    .map(executionTranscriptEventSequence)
    .filter((sequence): sequence is number => sequence !== undefined)
  return terminalSequences.length === 0 ? undefined : Math.max(...terminalSequences)
}

function executionTranscriptFinalTextAdd(
  events: Array<ExecutionTranscriptEvent>,
  attempts: ReadonlyArray<ExecutionTranscriptAttempt> | undefined,
  text: string,
): void {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (executionTranscriptEventIsText(events[index] as ExecutionTranscriptEvent)) events.splice(index, 1)
  }

  const identity = executionTranscriptAttemptResolve(attempts, events)
  const terminalIndex = events.findIndex((event) => {
    const record = objectRecord(event.event)
    const eventType = record?.eventType
    return eventType === "terminal" || (typeof eventType === "string" && eventType.startsWith("run-"))
  })
  const terminalSequence = executionTranscriptTerminalSequenceResolve(events)
  const finalText: ExecutionTranscriptEvent = {
    attemptOrdinal: identity.attemptOrdinal,
    event: { eventType: "text_delta", payload: { delta: text } },
    ...(terminalSequence === undefined ? {} : { sequence: terminalSequence - 0.5 }),
    streamId: identity.streamId,
  }
  events.splice(terminalIndex < 0 ? events.length : terminalIndex, 0, finalText)
}

function executionTranscriptSnapshotApply(
  input: ExecutionTranscriptProjectInput,
  attempts: ReadonlyArray<ExecutionTranscriptAttempt> | undefined,
  events: Array<ExecutionTranscriptEvent>,
): ExecutionTranscriptRun | undefined {
  const snapshot = input.activeSnapshot
  if (snapshot === undefined) return input.run

  const cutoff = snapshot.lastSequence
  const backlog = (input.backlog ?? []).map(executionTranscriptEventProject).filter((event) => {
    const sequence = executionTranscriptEventSequence(event)
    return sequence !== undefined && sequence > cutoff
  })
  const knownSequences = new Set(
    events
      .map(executionTranscriptEventSequence)
      .filter((sequence): sequence is number => sequence !== undefined)
      .map((sequence) => `${sequence}`),
  )
  events.push(
    ...backlog.filter((event) => {
      const sequence = executionTranscriptEventSequence(event)
      if (sequence === undefined) return true
      const key = `${sequence}`
      if (knownSequences.has(key)) return false
      knownSequences.add(key)
      return true
    }),
  )

  const snapshotIdentity = executionTranscriptAttemptResolve(attempts, events)
  const hasSnapshotText = events.some((event) => {
    const sequence = executionTranscriptEventSequence(event)
    return (
      event.attemptOrdinal === snapshotIdentity.attemptOrdinal &&
      event.streamId === snapshotIdentity.streamId &&
      (sequence === undefined || sequence <= cutoff) &&
      executionTranscriptEventIsText(event)
    )
  })
  if (snapshot.partialText.length > 0 && !hasSnapshotText) {
    const insertionIndex = events.findIndex((event) => {
      const sequence = executionTranscriptEventSequence(event)
      return sequence !== undefined && sequence > cutoff
    })
    events.splice(insertionIndex < 0 ? events.length : insertionIndex, 0, {
      attemptOrdinal: snapshotIdentity.attemptOrdinal,
      event: { eventType: "text_delta", payload: { delta: snapshot.partialText } },
      sequence: cutoff + 0.5,
      streamId: snapshotIdentity.streamId,
    })
  }

  return {
    ...input.run,
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
    status: snapshot.status,
  }
}

export function executionTranscriptProject(input: ExecutionTranscriptProjectInput) {
  const attempts = input.attempts
  const events = (input.events ?? []).map(executionTranscriptEventProject)
  const run = executionTranscriptSnapshotApply(input, attempts, events)
  if (input.finalizedAssistantText !== undefined)
    executionTranscriptFinalTextAdd(events, attempts, input.finalizedAssistantText)
  return executionTranscriptNormalize({
    ...(attempts === undefined ? {} : { attempts }),
    events,
    includeToolCallIds: input.includeToolCallIds,
    ...(run === undefined ? {} : { run }),
    ...(input.streamEnded === undefined ? {} : { streamEnded: input.streamEnded }),
  })
}
