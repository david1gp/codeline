import type { EventFeedRun, EventFeedState } from "../stream/client/eventFeedStateCreate.js"
import {
  type SessionStreamDelegation,
  type SessionStreamGroup,
  sessionStreamGroupsDerive,
} from "./sessionStreamGroupsDerive.js"
import { sessionStreamInFlightDerive } from "./sessionStreamInFlightDerive.js"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

type SessionStreamInput = Parameters<typeof sessionStreamGroupsDerive>[0]

type SessionStreamStateOptions = {
  delegations: () => ReadonlyArray<SessionStreamDelegation>
  eventFeedState?: () => EventFeedState
  inFlightRunId: () => string | null
  inFlightMessages: () => ReadonlyArray<{
    activities?: ReadonlyArray<TransientActivity>
    content: string
    id?: string
    role: string
  }>
  isEnabled: () => boolean
  sessionId: () => string | undefined
}

function sessionStreamRunStatusResolve(run: EventFeedRun): string {
  if (run.terminalStatus === "succeeded") return "succeeded"
  if (run.terminalStatus === "failed") return "failed"
  if (run.terminalStatus === "aborted") return "aborted"
  return run.phase
}

/**
 * A durable `tool` delta carries the serialized execution event, so its concrete
 * type has to be recovered from the payload. Collapsing every tool delta into
 * `tool_output` would erase the `tool_start` events the delegation links are
 * derived from, which is exactly what the stream view renders as a subagent link.
 */
function sessionStreamDeltaEventResolve(delta: { delta: string; deltaKind: string }): {
  eventType: string
  payload: unknown
} {
  if (delta.deltaKind === "text") return { eventType: "text_delta", payload: { delta: delta.delta } }
  if (delta.deltaKind === "thinking") return { eventType: "thinking_status", payload: { status: delta.delta } }
  try {
    const parsed: unknown = JSON.parse(delta.delta)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const eventType = (parsed as { eventType?: unknown }).eventType
      if (typeof eventType === "string") return { eventType, payload: parsed }
      // The persisted payload is the event's own payload, so its shape names the phase.
      const record = parsed as Record<string, unknown>
      if (typeof record.toolName === "string") return { eventType: "tool_start", payload: parsed }
      if (record.outcome !== undefined || record.result !== undefined)
        return { eventType: "tool_result", payload: parsed }
      return { eventType: "tool_output", payload: parsed }
    }
  } catch (_error: unknown) {
    // A non-JSON tool delta is rendered as plain output below.
  }
  return { eventType: "tool_output", payload: { output: delta.delta } }
}

function sessionStreamFeedInputResolve(
  state: EventFeedState | undefined,
  sessionId: string | undefined,
): SessionStreamInput {
  if (state === undefined || sessionId === undefined) return { delegations: [], events: [], runs: [] }
  const runs = [...state.activeRuns.values()]
    .filter((run) => run.sessionId === sessionId)
    .map((run) => ({
      // The feed identifies a run, not the attempt that produced an event, so the
      // attempt is left unidentified rather than given a synthetic id that could
      // never match a persisted delegation's parent attempt.
      attempts: [{ ordinal: 1, status: sessionStreamRunStatusResolve(run), streamId: run.runId }],
      clientRunId: run.runId,
      createdAt: 0,
      id: run.runId,
      snapshot: undefined,
      status: sessionStreamRunStatusResolve(run),
      streamId: run.runId,
    }))
  const events = [...state.activeRuns.values()]
    .filter((run) => run.sessionId === sessionId)
    .flatMap((run) => [
      ...run.deltas.map((delta) => ({
        createdAt: 0,
        ...sessionStreamDeltaEventResolve(delta),
        id: `${run.runId}:${delta.sequence}`,
        sequence: delta.sequence,
        streamId: run.runId,
      })),
      ...(run.terminalStatus === null
        ? []
        : [
            {
              createdAt: 0,
              eventType: "terminal",
              id: `${run.runId}:terminal`,
              payload: { status: run.terminalStatus === "aborted" ? "aborted" : run.terminalStatus },
              sequence: run.lastSequence + 1,
              streamId: run.runId,
            },
          ]),
    ])
  return { events, runs }
}

/**
 * Event-feed and in-flight stream content for the alternative session display.
 * Settled output is represented by finalized messages; active run deltas come
 * directly from the shared journal-backed event feed.
 */
export function sessionStreamStateCreate(options: SessionStreamStateOptions) {
  const activeSessionId = () => (options.isEnabled() ? options.sessionId() : undefined)
  const feedInput = () => sessionStreamFeedInputResolve(options.eventFeedState?.(), activeSessionId())
  const durableEntryCache: NonNullable<SessionStreamInput["entryCache"]> = new Map()
  let durableEntryCacheSessionId: string | undefined
  const durableGroups = () => {
    const sessionId = activeSessionId()
    if (sessionId !== durableEntryCacheSessionId) {
      durableEntryCache.clear()
      durableEntryCacheSessionId = sessionId
    }
    return sessionStreamGroupsDerive({
      ...feedInput(),
      delegations: options.delegations(),
      entryCache: durableEntryCache,
    })
  }
  const inFlightScope = () => {
    if (activeSessionId() === undefined) return undefined
    const runId = options.inFlightRunId()
    if (runId === null) return undefined
    // The feed reports the run, not its attempt, so the delegation is matched by
    // run identity; a delegation key is unique inside its parent run anyway.
    return { parentRunId: runId }
  }
  const revalidate = () => undefined

  return {
    groups: (): ReadonlyArray<SessionStreamGroup> => {
      const inFlight = sessionStreamInFlightDerive(
        options.inFlightMessages(),
        options.delegations(),
        inFlightScope(),
        feedInput().runs,
      )
      return inFlight === undefined ? durableGroups() : [...durableGroups(), inFlight]
    },
    isLoading: () => false,
    refresh: revalidate,
    revalidate,
  }
}

export type SessionStreamState = ReturnType<typeof sessionStreamStateCreate>
