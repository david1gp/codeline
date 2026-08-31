import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import type { JournalEvent } from "../../stream/schema/journalEventSchema.js"
import type { StreamProducerDelta } from "../../stream/schema/streamProducerDeltaSchema.js"
import type { AttemptStatus } from "../schema/attemptStatusSchema.js"
import type { RunCancellationKind } from "../schema/runCancellationKindSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import type { RunStatus } from "../schema/runStatusSchema.js"

type ExecutionTranscriptRunTerminalEvent = {
  eventType: "run-cancelled" | "run-completed" | "run-failed" | "run-interrupted"
  payload: {
    failure?: RunFailureMetadata | null
    messageId?: string | null
    reason?: string
    runId: string
    sessionId: string
    sessionRevision: number
  }
}

type ExecutionTranscriptNormalizedEvent =
  | ExecutionStreamEvent
  | ExecutionTranscriptRunTerminalEvent
  | JournalEvent
  | StreamProducerDelta

type ExecutionTranscriptEvent = {
  attemptOrdinal: number
  event: ExecutionTranscriptNormalizedEvent
  sequence?: number
  streamId: string
}

type ExecutionTranscriptAttempt = {
  ordinal: number
  status?: AttemptStatus
  streamId: string
}

type ExecutionTranscriptRun = {
  cancellationKind?: RunCancellationKind | null
  failure?: RunFailureMetadata | null
  status?: RunStatus
}

type ExecutionTranscriptNormalizeInput = {
  attempts?: ReadonlyArray<ExecutionTranscriptAttempt>
  events: ReadonlyArray<ExecutionTranscriptEvent>
  includeToolCallIds?: boolean
  run?: ExecutionTranscriptRun
  /** Set only after the selected stream's async iteration has ended. */
  streamEnded?: boolean
}

type ExecutionTranscriptActivity =
  | { kind: "thinking"; phase: "started" | "finished" }
  | { content: string; kind: "thinking"; phase: "delta" }
  | { kind: "tool"; name: string; phase: "started"; sequence?: number; toolCallId?: string }
  | { content: string; kind: "tool"; name?: string; phase: "delta"; sequence?: number; toolCallId?: string }
  | {
      content: string
      kind: "tool"
      name?: string
      phase: "output"
      sequence?: number
      toolCallId?: string
      truncated: boolean
    }
  | {
      content: string
      kind: "tool"
      name?: string
      outcome: "error" | "success"
      phase: "result"
      sequence?: number
      toolCallId?: string
      truncated: boolean
      workingDirectory?: string
    }
  | { kind: "written_file"; path: string }

type ExecutionTranscriptTerminal = {
  failure?: RunFailureMetadata
  reason?: string
  status: "aborted" | "completed" | "failed"
}

type ExecutionTranscriptCancellation = {
  kind?: RunCancellationKind
  reason?: string
}

type ExecutionTranscriptOutput = {
  activities: ReadonlyArray<ExecutionTranscriptActivity>
  assistantText: string
  authoritativeAttemptOrdinal: number | undefined
  cancellation: ExecutionTranscriptCancellation | null
  failure: RunFailureMetadata | null
  invariantViolations: ReadonlyArray<string>
  attempts: ReadonlyArray<{ ordinal: number; status: AttemptStatus }>
  terminalOutcome: ExecutionTranscriptTerminal | null
}

type OrderedTranscriptEvent = {
  event: ExecutionTranscriptEvent
  index: number
}

type ToolState = {
  closed: boolean
  name: string
}

function objectRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  return input as Record<string, unknown>
}

function isExecutionStreamEvent(input: ExecutionTranscriptNormalizedEvent): input is ExecutionStreamEvent {
  const eventType = objectRecord(input)?.eventType
  return (
    (eventType === "text_delta" ||
      eventType === "thinking_status" ||
      eventType === "tool_start" ||
      eventType === "tool_output" ||
      eventType === "tool_result" ||
      eventType === "written_file" ||
      eventType === "terminal") &&
    objectRecord(input)?.payload !== undefined
  )
}

function isStreamProducerDelta(input: ExecutionTranscriptNormalizedEvent): input is StreamProducerDelta {
  return objectRecord(input)?.deltaKind !== undefined
}

function eventSequence(input: ExecutionTranscriptEvent): number | undefined {
  if (input.sequence !== undefined) return input.sequence
  const candidate = objectRecord(input.event)
  return typeof candidate?.sequence === "number" ? candidate.sequence : undefined
}

function executionTranscriptToolMetadataCreate(
  input: ExecutionTranscriptNormalizeInput,
  event: ExecutionTranscriptEvent,
  toolCallId: string,
): { sequence?: number; toolCallId?: string } {
  if (input.includeToolCallIds !== true) return {}
  const sequence = eventSequence(event)
  return { ...(sequence === undefined ? {} : { sequence }), toolCallId }
}

function orderedEvents(events: ReadonlyArray<ExecutionTranscriptEvent>): Array<OrderedTranscriptEvent> {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const leftSequence = eventSequence(left.event)
      const rightSequence = eventSequence(right.event)
      if (leftSequence !== undefined && rightSequence !== undefined && leftSequence !== rightSequence)
        return leftSequence - rightSequence
      return left.index - right.index
    })
}

function terminalStatusToAttemptStatus(status: ExecutionTranscriptTerminal["status"]): AttemptStatus {
  if (status === "completed") return "succeeded"
  if (status === "failed") return "failed"
  return "aborted"
}

function terminalEqual(left: ExecutionTranscriptTerminal, right: ExecutionTranscriptTerminal): boolean {
  return (
    left.status === right.status &&
    left.reason === right.reason &&
    left.failure?.code === right.failure?.code &&
    left.failure?.message === right.failure?.message
  )
}

function terminalFromEvent(input: ExecutionTranscriptNormalizedEvent): ExecutionTranscriptTerminal | null {
  if (isStreamProducerDelta(input)) return null

  if (isExecutionStreamEvent(input)) {
    if (input.eventType !== "terminal") return null
    if (input.payload.status === "completed") return { status: "completed" }
    if (input.payload.status === "aborted") return { status: "aborted" }
    return {
      ...(input.payload.code === undefined && input.payload.message === undefined
        ? {}
        : {
            failure: {
              code: input.payload.code ?? "provider_failed",
              message: input.payload.message ?? "The provider failed.",
            },
          }),
      status: "failed",
    }
  }

  const event = objectRecord(input)
  const payload = objectRecord(event?.payload)
  if (event?.eventType === "run-completed" && payload !== undefined) return { status: "completed" }
  if (event?.eventType === "run-failed" && payload !== undefined) {
    const failure = objectRecord(payload.failure)
    return {
      ...(failure !== undefined && typeof failure.code === "string" && typeof failure.message === "string"
        ? { failure: { code: failure.code, message: failure.message } }
        : {}),
      status: "failed",
    }
  }
  if (event?.eventType === "run-cancelled" && payload !== undefined) {
    return { ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}), status: "aborted" }
  }
  if (event?.eventType === "run-interrupted" && payload !== undefined) {
    return { ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}), status: "aborted" }
  }

  if (event?.eventType === "run-completed") return { status: "completed" }
  if (event?.eventType === "run-failed") {
    const failure = objectRecord(event.failure)
    return {
      ...(failure !== undefined && typeof failure.code === "string" && typeof failure.message === "string"
        ? { failure: { code: failure.code, message: failure.message } }
        : {}),
      status: "failed",
    }
  }
  if (event?.eventType === "run-cancelled") {
    return { ...(typeof event.reason === "string" ? { reason: event.reason } : {}), status: "aborted" }
  }
  if (event?.eventType === "run-interrupted")
    return { ...(typeof event.reason === "string" ? { reason: event.reason } : {}), status: "aborted" }
  return null
}

function attemptsResolve(input: ExecutionTranscriptNormalizeInput): Array<ExecutionTranscriptAttempt> {
  if (input.attempts !== undefined && input.attempts.length > 0) return [...input.attempts]

  const attempts = new Map<string, ExecutionTranscriptAttempt>()
  for (const event of input.events) {
    const key = `${event.attemptOrdinal}\u0000${event.streamId}`
    if (!attempts.has(key)) attempts.set(key, { ordinal: event.attemptOrdinal, streamId: event.streamId })
  }
  return [...attempts.values()]
}

function attemptOrder(left: ExecutionTranscriptAttempt, right: ExecutionTranscriptAttempt): number {
  return left.ordinal - right.ordinal || left.streamId.localeCompare(right.streamId)
}

function attemptStatusesResolve(
  attempts: ReadonlyArray<ExecutionTranscriptAttempt>,
  events: ReadonlyArray<ExecutionTranscriptEvent>,
): Array<{ ordinal: number; status: AttemptStatus }> {
  const terminalByAttempt = new Map<string, AttemptStatus>()
  for (const ordered of orderedEvents(events)) {
    const terminal = terminalFromEvent(ordered.event.event)
    if (terminal === null) continue
    const key = `${ordered.event.attemptOrdinal}\u0000${ordered.event.streamId}`
    if (!terminalByAttempt.has(key)) terminalByAttempt.set(key, terminalStatusToAttemptStatus(terminal.status))
  }

  return [...attempts].sort(attemptOrder).map((attempt) => ({
    ordinal: attempt.ordinal,
    status:
      attempt.status ??
      terminalByAttempt.get(`${attempt.ordinal}\u0000${attempt.streamId}`) ??
      (events.some((event) => event.attemptOrdinal === attempt.ordinal && event.streamId === attempt.streamId)
        ? "running"
        : "accepted"),
  }))
}

function failureResolve(
  terminal: ExecutionTranscriptTerminal | null,
  run: ExecutionTranscriptRun | undefined,
): RunFailureMetadata | null {
  if (terminal?.failure !== undefined) return terminal.failure
  return run?.failure ?? null
}

function terminalFromRun(run: ExecutionTranscriptRun | undefined): ExecutionTranscriptTerminal | null {
  if (run?.status === "succeeded") return { status: "completed" }
  if (run?.status === "failed") return { ...(run.failure == null ? {} : { failure: run.failure }), status: "failed" }
  if (run?.status === "aborted") return { status: "aborted" }
  return null
}

export function executionTranscriptNormalize(input: ExecutionTranscriptNormalizeInput): ExecutionTranscriptOutput {
  const attempts = attemptsResolve(input)
  const invariantViolations: string[] = []
  const ordinals = new Set<number>()
  for (const attempt of attempts) {
    if (ordinals.has(attempt.ordinal)) invariantViolations.push("duplicate_attempt_ordinal")
    ordinals.add(attempt.ordinal)
  }

  const authoritativeAttempt = [...attempts].sort(attemptOrder).at(-1)
  const authoritativeAttemptOrdinal = authoritativeAttempt?.ordinal
  const selectedEvents =
    authoritativeAttempt === undefined
      ? []
      : orderedEvents(input.events)
          .map(({ event }) => event)
          .filter(
            (event) =>
              event.attemptOrdinal === authoritativeAttempt.ordinal && event.streamId === authoritativeAttempt.streamId,
          )
  if (authoritativeAttempt !== undefined) {
    for (const event of input.events) {
      if (event.attemptOrdinal === authoritativeAttempt.ordinal && event.streamId !== authoritativeAttempt.streamId)
        if (!invariantViolations.includes("stream_isolation")) invariantViolations.push("stream_isolation")
    }
  }

  const selectedTerminal =
    selectedEvents.map((event) => terminalFromEvent(event.event)).find((terminal) => terminal !== null) ?? null
  const selectedAttemptStatus =
    authoritativeAttempt?.status ??
    (selectedTerminal === null ? undefined : terminalStatusToAttemptStatus(selectedTerminal.status))
  const runFailed = input.run?.status === "failed"
  const runAborted = input.run?.status === "aborted"
  const textParts: string[] = []
  const activities: ExecutionTranscriptActivity[] = []
  const tools = new Map<string, ToolState>()
  let terminalOutcome: ExecutionTranscriptTerminal | null = null
  let lastToolOutputCallId: string | undefined
  let cancellation: ExecutionTranscriptCancellation | null =
    input.run?.cancellationKind === undefined || input.run.cancellationKind === null
      ? null
      : { kind: input.run.cancellationKind }

  const violationAdd = (violation: string) => {
    if (!invariantViolations.includes(violation)) invariantViolations.push(violation)
  }

  for (const event of selectedEvents) {
    const terminal = terminalFromEvent(event.event)
    if (terminal !== null) {
      if (terminalOutcome !== null) {
        violationAdd("duplicate_terminal")
        if (!terminalEqual(terminalOutcome, terminal)) violationAdd("conflicting_terminal")
        continue
      }
      terminalOutcome = terminal
      const eventType = objectRecord(event.event)?.eventType
      if (eventType === "run-cancelled") {
        cancellation = {
          ...(cancellation?.kind === undefined ? {} : { kind: cancellation.kind }),
          ...(terminal.reason === undefined ? {} : { reason: terminal.reason }),
        }
      }
      if (terminal.status === "aborted" && eventType === "terminal") cancellation ??= {}
      if (terminal.status !== "completed") textParts.length = 0
      continue
    }
    if (terminalOutcome !== null) {
      violationAdd("event_after_terminal")
      continue
    }

    if (isStreamProducerDelta(event.event)) {
      if (event.event.deltaKind === "text") textParts.push(event.event.delta)
      if (event.event.deltaKind === "thinking") {
        const previous = activities.at(-1)
        if (previous?.kind === "thinking" && previous.phase === "delta") previous.content += event.event.delta
        else activities.push({ content: event.event.delta, kind: "thinking", phase: "delta" })
      }
      if (event.event.deltaKind === "tool") {
        const previous = activities.at(-1)
        if (previous?.kind === "tool" && previous.phase === "delta") previous.content += event.event.delta
        else activities.push({ content: event.event.delta, kind: "tool", phase: "delta" })
      }
      continue
    }

    if (isExecutionStreamEvent(event.event)) {
      if (event.event.eventType === "text_delta") {
        textParts.push(event.event.payload.delta)
        continue
      }
      if (event.event.eventType === "thinking_status") {
        activities.push({ kind: "thinking", phase: event.event.payload.status })
        continue
      }
      if (event.event.eventType === "tool_start") {
        tools.set(event.event.payload.toolCallId, { closed: false, name: event.event.payload.toolName })
        activities.push({
          ...executionTranscriptToolMetadataCreate(input, event, event.event.payload.toolCallId),
          kind: "tool",
          name: event.event.payload.toolName,
          phase: "started",
        })
        continue
      }
      if (event.event.eventType === "tool_output") {
        const tool = tools.get(event.event.payload.toolCallId)
        if (tool === undefined) violationAdd("tool_output_without_start")
        if (tool?.closed === true) violationAdd("tool_output_after_result")
        const previous = activities.at(-1)
        if (
          previous?.kind === "tool" &&
          previous.phase === "output" &&
          lastToolOutputCallId === event.event.payload.toolCallId
        ) {
          activities[activities.length - 1] = {
            ...previous,
            content: previous.content + event.event.payload.output,
            truncated: previous.truncated || event.event.payload.truncated,
          }
        } else {
          activities.push({
            content: event.event.payload.output,
            ...executionTranscriptToolMetadataCreate(input, event, event.event.payload.toolCallId),
            ...(tool === undefined ? {} : { name: tool.name }),
            kind: "tool",
            phase: "output",
            truncated: event.event.payload.truncated,
          })
        }
        lastToolOutputCallId = event.event.payload.toolCallId
        continue
      }
      if (event.event.eventType === "tool_result") {
        const tool = tools.get(event.event.payload.toolCallId)
        if (tool === undefined) violationAdd("tool_result_without_start")
        if (tool?.closed === true) violationAdd("duplicate_tool_result")
        if (tool !== undefined) tool.closed = true
        activities.push({
          content: event.event.payload.result,
          ...executionTranscriptToolMetadataCreate(input, event, event.event.payload.toolCallId),
          ...(tool === undefined ? {} : { name: tool.name }),
          kind: "tool",
          outcome: event.event.payload.outcome,
          phase: "result",
          truncated: event.event.payload.truncated,
          ...(input.includeToolCallIds !== true || event.event.payload.workingDirectory === undefined
            ? {}
            : { workingDirectory: event.event.payload.workingDirectory }),
        })
        lastToolOutputCallId = undefined
        continue
      }
      if (event.event.eventType === "written_file")
        activities.push({ kind: "written_file", path: event.event.payload.path })
    }
  }

  const runTerminal = terminalFromRun(input.run)
  if (terminalOutcome === null) terminalOutcome = runTerminal
  else if (runTerminal !== null && !terminalEqual(terminalOutcome, runTerminal))
    violationAdd("terminal_status_conflict")
  if (
    authoritativeAttempt?.status !== undefined &&
    selectedTerminal !== null &&
    authoritativeAttempt.status !== terminalStatusToAttemptStatus(selectedTerminal.status)
  )
    violationAdd("attempt_terminal_status_conflict")
  if (
    selectedAttemptStatus !== undefined &&
    runTerminal !== null &&
    selectedAttemptStatus !== terminalStatusToAttemptStatus(runTerminal.status)
  )
    violationAdd("attempt_run_status_conflict")
  if (input.streamEnded === true && terminalOutcome === null) violationAdd("unexpected_stream_end")
  if ((terminalOutcome !== null || input.streamEnded === true) && [...tools.values()].some((tool) => !tool.closed))
    violationAdd("incomplete_tool_lifecycle")
  if (terminalOutcome?.status === "aborted" && cancellation === null) cancellation = {}
  if (selectedAttemptStatus === "failed" || selectedAttemptStatus === "aborted" || runFailed || runAborted)
    textParts.length = 0
  if (terminalOutcome?.status !== "completed" && terminalOutcome !== null) textParts.length = 0

  return {
    activities,
    assistantText: textParts.join(""),
    authoritativeAttemptOrdinal,
    cancellation,
    failure: failureResolve(terminalOutcome, input.run),
    invariantViolations,
    attempts: attemptStatusesResolve(attempts, input.events),
    terminalOutcome,
  }
}
