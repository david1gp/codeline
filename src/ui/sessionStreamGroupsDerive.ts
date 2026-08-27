import { providerExecutionEventFromStreamChunk } from "../providers/runtime/providerExecutionEventFromStreamChunk.js"
import { sessionStreamDelegationResolve } from "./sessionStreamDelegationResolve.js"

export type SessionStreamEntry = {
  delegation?: SessionStreamDelegationLink
  detail?: string
  id: string
  kind: "output" | "terminal" | "thinking" | "tool" | "written-file"
  label: string
  status?: string
}

export type SessionStreamDelegation = {
  /** Authoritative child target from the delegations API; live feed rows carry no snapshot. */
  childAgentId?: string
  childRunId: string
  delegationKey: string
  id: string
  parentAttemptId: string
  parentRunId: string
  task: string
}

export type SessionStreamDelegationLink = SessionStreamDelegation & {
  childAgentId?: string
  childStreamId: string
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
  id?: string
  ordinal: number
  status: string
  streamId: string
}

type SessionStreamRunRow = {
  attempts?: ReadonlyArray<SessionStreamAttemptRow>
  clientRunId?: string
  createdAt: number
  id: string
  snapshot?: unknown
  status: string
  streamId: string
}

type SessionStreamOrigin = {
  attemptOrdinal: number
  attemptId?: string
  label: string
  runCreatedAt: number
  runId: string
  status: string
}

const streamEntryDetailLimit = 400
const streamEntryReuseCacheLimit = 512

type SessionStreamEntryReuseCache = Map<string, { entry: SessionStreamEntry; signature: string }>
type SessionStreamEntryReuseUpdate = [string, { entry: SessionStreamEntry; signature: string }]

function streamPayloadField(payload: unknown, key: string): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  if (typeof value === "string") return value.length === 0 ? undefined : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value)
      return serialized === undefined ? undefined : serialized
    } catch (_error: unknown) {
      return undefined
    }
  }
  return undefined
}

function streamPayloadObject(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined
  return payload as Record<string, unknown>
}

function streamDelegationActivityMerge(
  current: { agentId?: string; serverId?: string; task?: string },
  value: unknown,
): void {
  const object = streamPayloadObject(value)
  if (object === undefined) return
  if (typeof object.task === "string") current.task = object.task
  if (typeof object.agentId === "string") current.agentId = object.agentId
  if (typeof object.serverId === "string") current.serverId = object.serverId
}

function streamDelegationInputParse(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return streamPayloadObject(JSON.parse(value))
    } catch (_error: unknown) {
      return undefined
    }
  }
  return streamPayloadObject(value)
}

function streamDelegationActivitiesResolve(
  events: ReadonlyArray<SessionStreamEventRow>,
): Map<string, { agentId?: string; serverId?: string; task?: string }> {
  const activities = new Map<string, { agentId?: string; serverId?: string; task?: string }>()
  const argumentsByToolCall = new Map<string, string>()
  for (const event of events) {
    const payload = streamPayloadObject(event.payload)
    if (payload === undefined) continue
    const toolCallId = typeof payload.toolCallId === "string" ? payload.toolCallId : undefined
    if (toolCallId === undefined) continue
    const activity = activities.get(toolCallId) ?? {}
    const eventType = event.eventType.toUpperCase()
    if (eventType === "TOOL_CALL_START" || event.eventType === "tool_start") {
      streamDelegationActivityMerge(activity, payload)
      streamDelegationActivityMerge(activity, payload.input)
    }
    if (eventType === "TOOL_CALL_ARGS") {
      const delta = typeof payload.delta === "string" ? payload.delta : undefined
      const accumulated = typeof payload.args === "string" ? payload.args : undefined
      const serialized = accumulated ?? `${argumentsByToolCall.get(toolCallId) ?? ""}${delta ?? ""}`
      argumentsByToolCall.set(toolCallId, serialized)
      streamDelegationActivityMerge(activity, streamDelegationInputParse(serialized))
    }
    if (eventType === "TOOL_CALL_END") streamDelegationActivityMerge(activity, payload.input)
    activities.set(toolCallId, activity)
  }
  return activities
}

function streamEntryDetailBound(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return value.length > streamEntryDetailLimit ? `${value.slice(0, streamEntryDetailLimit)}…` : value
}

function streamEntryReuseSignature(
  events: ReadonlyArray<SessionStreamEventRow>,
  entry: SessionStreamEntry,
): string | undefined {
  try {
    return JSON.stringify({
      entry,
      events: events.map((event) => ({
        eventType: event.eventType,
        id: event.id,
        payload: event.payload,
        sequence: event.sequence,
        streamId: event.streamId,
      })),
    })
  } catch (_error: unknown) {
    return undefined
  }
}

function streamEntryReuseResolve(
  cache: SessionStreamEntryReuseCache | undefined,
  updates: Array<SessionStreamEntryReuseUpdate>,
  events: ReadonlyArray<SessionStreamEventRow>,
  entry: SessionStreamEntry,
): SessionStreamEntry {
  if (cache === undefined) return entry
  const signature = streamEntryReuseSignature(events, entry)
  if (signature === undefined) return entry
  const identity = JSON.stringify([events[0]?.streamId ?? "", entry.id])
  const cached = cache.get(identity)
  const resolved = cached?.signature === signature ? cached.entry : entry
  updates.push([identity, { entry: resolved, signature }])
  return resolved
}

function streamEntryReuseUpdatesApply(
  cache: SessionStreamEntryReuseCache,
  updates: ReadonlyArray<SessionStreamEntryReuseUpdate>,
): void {
  for (const [identity, value] of updates) {
    cache.delete(identity)
    cache.set(identity, value)
    while (cache.size > streamEntryReuseCacheLimit) {
      const oldest = cache.keys().next().value as string | undefined
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }
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
        ...(attempt.id === undefined ? {} : { attemptId: attempt.id }),
        label: `Attempt ${attempt.ordinal}`,
        runCreatedAt: run.createdAt,
        runId: run.id,
        status: attempt.status,
      })
    }
  }
  return origins
}

function streamRunAgentIdResolve(run: { snapshot?: unknown } | undefined): string | undefined {
  const snapshot = streamPayloadObject(run?.snapshot)
  const target = streamPayloadObject(snapshot?.target)
  const agentId = streamPayloadField(target, "agentId")?.trim()
  return agentId === undefined || agentId.length === 0 ? undefined : agentId
}

function streamEntryResolve(
  event: SessionStreamEventRow,
  delegation?: SessionStreamDelegationLink,
): SessionStreamEntry | undefined {
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
      ...(delegation === undefined ? {} : { delegation }),
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

export function sessionStreamDelegationLinkResolve(
  delegation: SessionStreamDelegation,
  runs: ReadonlyArray<{
    attempts?: ReadonlyArray<{ streamId: string }>
    id: string
    snapshot?: unknown
    streamId?: string
  }>,
): SessionStreamDelegationLink {
  const childRun = runs.find((run) => run.id === delegation.childRunId)
  const childAttempt = childRun?.attempts?.at(-1)
  const childAgentId = delegation.childAgentId ?? streamRunAgentIdResolve(childRun)
  return {
    ...delegation,
    ...(childAgentId === undefined ? {} : { childAgentId }),
    childStreamId: childAttempt?.streamId ?? childRun?.streamId ?? `run-child:${delegation.childRunId}`,
  }
}

function streamDelegationResolve(
  event: SessionStreamEventRow,
  origin: SessionStreamOrigin | undefined,
  delegations: ReadonlyArray<SessionStreamDelegation>,
  runs: ReadonlyArray<SessionStreamRunRow>,
  activity?: { agentId?: string; serverId?: string; task?: string },
): SessionStreamDelegationLink | undefined {
  if (event.eventType !== "tool_start" || origin === undefined) return undefined
  if (streamPayloadField(event.payload, "toolName") !== "delegate_task") return undefined
  const toolCallId = streamPayloadField(event.payload, "toolCallId")
  if (toolCallId === undefined) return undefined
  const delegation = sessionStreamDelegationResolve({
    activity: { ...activity, toolCallId },
    delegations,
    runs,
    // A live feed origin knows its run but not its attempt. Matching by run alone
    // stays exact, because a delegation key is unique within its parent run.
    scope: {
      ...(origin.attemptId === undefined ? {} : { parentAttemptId: origin.attemptId }),
      parentRunId: origin.runId,
    },
  })
  return delegation === undefined ? undefined : sessionStreamDelegationLinkResolve(delegation, runs)
}

function streamEventNormalize(event: SessionStreamEventRow): SessionStreamEventRow | undefined {
  if (
    ["text_delta", "thinking_status", "tool_start", "tool_output", "tool_result", "written_file", "terminal"].includes(
      event.eventType,
    )
  )
    return event
  if (typeof event.payload !== "object" || event.payload === null || Array.isArray(event.payload)) return undefined
  const parsed = providerExecutionEventFromStreamChunk({
    ...(event.payload as Record<string, unknown>),
    type: event.eventType,
  })
  if (!parsed.success || parsed.data === null) return undefined
  return { ...event, eventType: parsed.data.type, payload: parsed.data }
}

function streamEntriesCollect(
  events: ReadonlyArray<SessionStreamEventRow>,
  origin: SessionStreamOrigin | undefined,
  delegations: ReadonlyArray<SessionStreamDelegation>,
  runs: ReadonlyArray<SessionStreamRunRow>,
  entryCache?: SessionStreamEntryReuseCache,
  entryReuseUpdates: Array<SessionStreamEntryReuseUpdate> = [],
): Array<SessionStreamEntry> {
  const entries: Array<SessionStreamEntry> = []
  const delegationActivities = streamDelegationActivitiesResolve(events)
  let output: { delta: string; events: Array<SessionStreamEventRow>; id: string } | undefined
  const outputFlush = () => {
    if (output === undefined) return
    const entry = { detail: output.delta, id: output.id, kind: "output" as const, label: "Output" }
    entries.push(streamEntryReuseResolve(entryCache, entryReuseUpdates, output.events, entry))
    output = undefined
  }
  for (const rawEvent of events) {
    const event = streamEventNormalize(rawEvent)
    if (event === undefined) continue
    if (event.eventType === "text_delta") {
      const delta = streamPayloadField(event.payload, "delta") ?? ""
      output =
        output === undefined
          ? { delta, events: [event], id: event.id }
          : { delta: output.delta + delta, events: [...output.events, event], id: output.id }
      continue
    }
    outputFlush()
    const toolCallId = streamPayloadField(event.payload, "toolCallId")
    const entry = streamEntryResolve(
      event,
      streamDelegationResolve(
        event,
        origin,
        delegations,
        runs,
        toolCallId === undefined ? undefined : delegationActivities.get(toolCallId),
      ),
    )
    if (entry !== undefined) entries.push(streamEntryReuseResolve(entryCache, entryReuseUpdates, [event], entry))
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
  delegations?: ReadonlyArray<SessionStreamDelegation>
  entryCache?: Map<string, { entry: SessionStreamEntry; signature: string }>
  events: ReadonlyArray<SessionStreamEventRow>
  runs: ReadonlyArray<SessionStreamRunRow>
}): Array<SessionStreamGroup> {
  const origins = streamOriginsResolve(input.runs)
  const entryReuseUpdates: Array<SessionStreamEntryReuseUpdate> = []
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
      entries: streamEntriesCollect(
        ordered,
        origin,
        input.delegations ?? [],
        input.runs,
        input.entryCache,
        entryReuseUpdates,
      ),
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

  if (input.entryCache !== undefined) streamEntryReuseUpdatesApply(input.entryCache, entryReuseUpdates)
  return groups.map(({ order: _order, ...group }) => group)
}
