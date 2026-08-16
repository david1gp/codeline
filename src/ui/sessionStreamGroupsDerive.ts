export type SessionStreamEntry = {
  detail?: string
  id: string
  kind: "output" | "terminal" | "thinking" | "tool" | "written-file"
  label: string
  status?: string
}

export type SessionStreamGroup = {
  entries: ReadonlyArray<SessionStreamEntry>
  id: string
  label: string
  status?: string
  streamId: string
}

type SessionStreamEventRow = {
  createdAt: number
  eventType: string
  id: string
  payload: unknown
  sequence: number
  streamId: string
}

type SessionStreamAttemptRow = {
  ordinal: number
  status: string
  streamId: string
}

type SessionStreamRunRow = {
  attempts?: ReadonlyArray<SessionStreamAttemptRow>
  createdAt: number
  id: string
  status: string
  streamId: string
}

type SessionStreamOrigin = {
  attemptOrdinal: number
  label: string
  runCreatedAt: number
  runId: string
  status: string
}

const streamEntryDetailLimit = 400

function streamPayloadField(payload: unknown, key: string): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  if (typeof value === "string") return value.length === 0 ? undefined : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function streamEntryDetailBound(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return value.length > streamEntryDetailLimit ? `${value.slice(0, streamEntryDetailLimit)}…` : value
}

function streamOriginsResolve(runs: ReadonlyArray<SessionStreamRunRow>): Map<string, SessionStreamOrigin> {
  const origins = new Map<string, SessionStreamOrigin>()
  for (const run of runs) {
    const attempts = run.attempts ?? []
    origins.set(run.streamId, {
      attemptOrdinal: 0,
      label: "Run",
      runCreatedAt: run.createdAt,
      runId: run.id,
      status: run.status,
    })
    for (const attempt of attempts) {
      origins.set(attempt.streamId, {
        attemptOrdinal: attempt.ordinal,
        label: `Attempt ${attempt.ordinal}`,
        runCreatedAt: run.createdAt,
        runId: run.id,
        status: attempt.status,
      })
    }
  }
  return origins
}

function streamEntryResolve(event: SessionStreamEventRow): SessionStreamEntry | undefined {
  if (event.eventType === "thinking_status")
    return {
      id: event.id,
      kind: "thinking",
      label: "Thinking",
      ...(streamPayloadField(event.payload, "status") === undefined
        ? {}
        : { status: streamPayloadField(event.payload, "status") }),
    }
  if (event.eventType === "tool_start")
    return {
      id: event.id,
      kind: "tool",
      label: streamPayloadField(event.payload, "toolName") ?? "tool",
      status: "start",
      ...(streamPayloadField(event.payload, "toolCallId") === undefined
        ? {}
        : { detail: streamPayloadField(event.payload, "toolCallId") }),
    }
  if (event.eventType === "tool_output")
    return {
      id: event.id,
      kind: "tool",
      label: "Tool output",
      status: streamPayloadField(event.payload, "truncated") === "true" ? "truncated" : "output",
      ...(streamEntryDetailBound(streamPayloadField(event.payload, "output")) === undefined
        ? {}
        : { detail: streamEntryDetailBound(streamPayloadField(event.payload, "output")) }),
    }
  if (event.eventType === "tool_result")
    return {
      id: event.id,
      kind: "tool",
      label: "Tool result",
      status: streamPayloadField(event.payload, "outcome") ?? "result",
      ...(streamEntryDetailBound(streamPayloadField(event.payload, "result")) === undefined
        ? {}
        : { detail: streamEntryDetailBound(streamPayloadField(event.payload, "result")) }),
    }
  if (event.eventType === "written_file")
    return {
      id: event.id,
      kind: "written-file",
      label: "Wrote file",
      ...(streamPayloadField(event.payload, "path") === undefined
        ? {}
        : { detail: streamPayloadField(event.payload, "path") }),
    }
  if (event.eventType === "terminal") {
    const message = streamPayloadField(event.payload, "message")
    const code = streamPayloadField(event.payload, "code")
    const detail = message === undefined ? code : code === undefined ? message : `${code} · ${message}`
    return {
      id: event.id,
      kind: "terminal",
      label: "Terminal",
      ...(streamPayloadField(event.payload, "status") === undefined
        ? {}
        : { status: streamPayloadField(event.payload, "status") }),
      ...(streamEntryDetailBound(detail) === undefined ? {} : { detail: streamEntryDetailBound(detail) }),
    }
  }
  return undefined
}

function streamEntriesCollect(events: ReadonlyArray<SessionStreamEventRow>): Array<SessionStreamEntry> {
  const entries: Array<SessionStreamEntry> = []
  let output: { delta: string; id: string } | undefined
  const outputFlush = () => {
    if (output === undefined) return
    entries.push({ detail: output.delta, id: output.id, kind: "output", label: "Output" })
    output = undefined
  }
  for (const event of events) {
    if (event.eventType === "text_delta") {
      const delta = streamPayloadField(event.payload, "delta") ?? ""
      output = output === undefined ? { delta, id: event.id } : { delta: output.delta + delta, id: output.id }
      continue
    }
    outputFlush()
    const entry = streamEntryResolve(event)
    if (entry !== undefined) entries.push(entry)
  }
  outputFlush()
  return entries
}

/**
 * Group persisted execution-stream events per stream and order the groups by
 * run creation, run identity, attempt ordinal and stream identity, so the
 * stream view stays deterministic across syncs. Streams without a known run
 * row still render, sorted after the known ones by stream identity.
 */
export function sessionStreamGroupsDerive(input: {
  events: ReadonlyArray<SessionStreamEventRow>
  runs: ReadonlyArray<SessionStreamRunRow>
}): Array<SessionStreamGroup> {
  const origins = streamOriginsResolve(input.runs)
  const byStream = new Map<string, Array<SessionStreamEventRow>>()
  for (const event of input.events) {
    const existing = byStream.get(event.streamId)
    if (existing) existing.push(event)
    else byStream.set(event.streamId, [event])
  }

  const groups = [...byStream.entries()].map(([streamId, events]) => {
    const origin = origins.get(streamId)
    const ordered = [...events].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    return {
      entries: streamEntriesCollect(ordered),
      id: streamId,
      label: origin?.label ?? "Stream",
      ...(origin?.status === undefined ? {} : { status: origin.status }),
      order: {
        attemptOrdinal: origin?.attemptOrdinal ?? 0,
        known: origin === undefined ? 1 : 0,
        runCreatedAt: origin?.runCreatedAt ?? 0,
        runId: origin?.runId ?? "",
      },
      streamId,
    }
  })

  groups.sort(
    (left, right) =>
      left.order.known - right.order.known ||
      left.order.runCreatedAt - right.order.runCreatedAt ||
      left.order.runId.localeCompare(right.order.runId) ||
      left.order.attemptOrdinal - right.order.attemptOrdinal ||
      left.streamId.localeCompare(right.streamId),
  )

  return groups.map(({ order: _order, ...group }) => group)
}
