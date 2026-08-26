import { providerExecutionEventFromStreamChunk } from "../../providers/runtime/providerExecutionEventFromStreamChunk.js"
import { executionTranscriptNormalize } from "../../run/actions/executionTranscriptNormalize.js"
import type { AttemptStatus } from "../../run/schema/attemptStatusSchema.js"
import type { RunCancellationKind } from "../../run/schema/runCancellationKindSchema.js"
import type { RunFailureMetadata } from "../../run/schema/runFailureMetadataSchema.js"
import type { RunStatus } from "../../run/schema/runStatusSchema.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"

type InspectorAttempt = {
  id: string
  ordinal: number
  status: string
  streamId: string
}

type InspectorRun = {
  attempts: ReadonlyArray<InspectorAttempt>
  cancellationKind?: string | null
  failure?: RunFailureMetadata | null
  id: string
  status: string
  streamId: string
}

type InspectorStreamEvent = {
  attemptOrdinal?: number
  eventType: string
  payload?: unknown
  sequence?: number
  streamId: string
}

type InspectorTranscriptEvent = Parameters<typeof executionTranscriptNormalize>[0]["events"][number]
type InspectorTranscriptNormalizedEvent = InspectorTranscriptEvent["event"]

function inspectorObjectRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  return input as Record<string, unknown>
}

function inspectorAttemptStatusResolve(input: string): AttemptStatus | undefined {
  if (input === "accepted" || input === "running" || input === "succeeded" || input === "failed" || input === "aborted")
    return input
  return undefined
}

function inspectorRunStatusResolve(input: string): RunStatus | undefined {
  if (input === "accepted" || input === "running" || input === "succeeded" || input === "failed" || input === "aborted")
    return input
  return undefined
}

function inspectorCancellationKindResolve(input: string | null | undefined): RunCancellationKind | undefined {
  if (input === "requested" || input === "ancestor") return input
  return undefined
}

function inspectorEventAttemptOrdinalResolve(
  event: InspectorStreamEvent,
  attempts: ReadonlyArray<InspectorAttempt>,
): number {
  if (event.attemptOrdinal !== undefined) return event.attemptOrdinal
  return attempts.find((attempt) => attempt.streamId === event.streamId)?.ordinal ?? 1
}

function inspectorTranscriptEventCreate(event: InspectorStreamEvent, attemptOrdinal: number): InspectorTranscriptEvent {
  if (event.eventType === "delta") {
    return {
      attemptOrdinal,
      event: (event.payload ?? event) as InspectorTranscriptNormalizedEvent,
      ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
      streamId: event.streamId,
    }
  }

  const providerEvent = providerExecutionEventFromStreamChunk({
    ...(inspectorObjectRecord(event.payload) ?? {}),
    type: event.eventType,
  })
  if (providerEvent.success && providerEvent.data !== null) {
    const normalized = executionStreamEventNormalize(providerEvent.data)
    if (normalized.success) {
      return {
        attemptOrdinal,
        event: normalized.data,
        ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
        streamId: event.streamId,
      }
    }
  }

  return {
    attemptOrdinal,
    event: event as unknown as InspectorTranscriptNormalizedEvent,
    ...(event.sequence === undefined ? {} : { sequence: event.sequence }),
    streamId: event.streamId,
  }
}

function inspectorTranscriptAttemptsResolve(
  attempts: ReadonlyArray<InspectorAttempt>,
): NonNullable<Parameters<typeof executionTranscriptNormalize>[0]["attempts"]> {
  return attempts.map((attempt) => {
    const status = inspectorAttemptStatusResolve(attempt.status)
    return {
      ordinal: attempt.ordinal,
      ...(status === undefined ? {} : { status }),
      streamId: attempt.streamId,
    }
  })
}

function inspectorTranscriptRunResolve(
  run: InspectorRun | undefined,
): Parameters<typeof executionTranscriptNormalize>[0]["run"] {
  if (run === undefined) return undefined
  const status = inspectorRunStatusResolve(run.status)
  const cancellationKind = inspectorCancellationKindResolve(run.cancellationKind)
  return {
    ...(status === undefined ? {} : { status }),
    ...(cancellationKind === undefined ? {} : { cancellationKind }),
    ...(run.failure === undefined ? {} : { failure: run.failure }),
  }
}

function inspectorAttemptStreamsResolve(
  attempts: ReadonlyArray<InspectorAttempt>,
  events: ReadonlyArray<InspectorTranscriptEvent>,
): Array<{ ordinal: number; streamId: string }> {
  const streams = new Map<string, { ordinal: number; streamId: string }>()
  if (attempts.length > 0) {
    for (const attempt of attempts) streams.set(`${attempt.ordinal}\u0000${attempt.streamId}`, attempt)
  } else {
    for (const event of events) {
      const key = `${event.attemptOrdinal}\u0000${event.streamId}`
      if (!streams.has(key)) streams.set(key, { ordinal: event.attemptOrdinal, streamId: event.streamId })
    }
  }
  return [...streams.values()]
}

function inspectorAttemptStreamOrder(
  left: { ordinal: number; streamId: string },
  right: { ordinal: number; streamId: string },
) {
  return left.ordinal - right.ordinal || left.streamId.localeCompare(right.streamId)
}

function inspectorEventCountsResolve(events: ReadonlyArray<InspectorStreamEvent>) {
  const counts = new Map<string, number>()
  for (const event of events) counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([eventType, count]) => ({ count, eventType }))
}

export function simulateInspectorBackendStateDerive(input: {
  events: ReadonlyArray<InspectorStreamEvent>
  run: InspectorRun | undefined
}) {
  const attempts = input.run?.attempts ?? []
  const transcriptEvents = input.events.map((event) =>
    inspectorTranscriptEventCreate(event, inspectorEventAttemptOrdinalResolve(event, attempts)),
  )
  const transcript = executionTranscriptNormalize({
    attempts: attempts.length === 0 ? undefined : inspectorTranscriptAttemptsResolve(attempts),
    events: transcriptEvents,
    run: inspectorTranscriptRunResolve(input.run),
  })
  // The persisted run row is authoritative for terminal failure inspection;
  // replayed terminal events may be incomplete or carry a provider fallback.
  const failure = input.run?.failure ?? transcript.failure
  const attemptStreams = inspectorAttemptStreamsResolve(attempts, transcriptEvents)
  const authoritativeStreamId =
    transcript.authoritativeAttemptOrdinal === undefined
      ? undefined
      : attemptStreams
          .filter(({ ordinal }) => ordinal === transcript.authoritativeAttemptOrdinal)
          .sort(inspectorAttemptStreamOrder)
          .at(-1)?.streamId
  const streamId = authoritativeStreamId ?? input.run?.streamId ?? input.events.at(-1)?.streamId
  const streamEvents = input.events.filter((event) => event.streamId === streamId)
  const eventCounts = inspectorEventCountsResolve(streamEvents)
  const persistedEventCounts = inspectorEventCountsResolve(input.events)

  return {
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      ordinal: attempt.ordinal,
      status: attempt.status,
      streamId: attempt.streamId,
    })),
    authoritativeAttemptOrdinal: transcript.authoritativeAttemptOrdinal,
    authoritativeStreamId,
    cancellation: transcript.cancellation,
    eventCounts,
    eventTotal: streamEvents.length,
    failure,
    invariantViolations: transcript.invariantViolations,
    persistedEventCounts,
    persistedEventTotal: input.events.length,
    run:
      input.run === undefined
        ? undefined
        : {
            cancellationKind: input.run.cancellationKind,
            ...(input.run.failure === undefined ? {} : { failure: input.run.failure }),
            id: input.run.id,
            status: input.run.status,
            streamId: input.run.streamId,
          },
    streamId,
    terminalReason: transcript.terminalOutcome?.reason,
  }
}
