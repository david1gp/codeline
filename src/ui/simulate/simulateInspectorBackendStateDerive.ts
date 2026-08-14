type InspectorAttempt = {
  id: string
  ordinal: number
  status: string
  streamId: string
}

type InspectorRun = {
  attempts: ReadonlyArray<InspectorAttempt>
  cancellationKind?: string | null
  id: string
  status: string
  streamId: string
}

type InspectorStreamEvent = {
  eventType: string
  streamId: string
}

export function simulateInspectorBackendStateDerive(input: {
  events: ReadonlyArray<InspectorStreamEvent>
  run: InspectorRun | undefined
}) {
  const attempts = input.run?.attempts ?? []
  const streamId = attempts.at(-1)?.streamId ?? input.run?.streamId ?? input.events.at(-1)?.streamId
  const streamEvents = input.events.filter((event) => event.streamId === streamId)
  const counts = new Map<string, number>()
  for (const event of streamEvents) counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1)

  return {
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      ordinal: attempt.ordinal,
      status: attempt.status,
      streamId: attempt.streamId,
    })),
    eventCounts: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([eventType, count]) => ({ count, eventType })),
    eventTotal: streamEvents.length,
    run:
      input.run === undefined
        ? undefined
        : {
            cancellationKind: input.run.cancellationKind,
            id: input.run.id,
            status: input.run.status,
            streamId: input.run.streamId,
          },
    streamId,
  }
}
