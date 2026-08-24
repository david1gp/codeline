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

function sessionStreamFeedInputResolve(
  state: EventFeedState | undefined,
  sessionId: string | undefined,
): SessionStreamInput {
  if (state === undefined || sessionId === undefined) return { delegations: [], events: [], runs: [] }
  const runs = [...state.activeRuns.values()]
    .filter((run) => run.sessionId === sessionId)
    .map((run) => ({
      attempts: [
        {
          id: `${run.runId}:attempt`,
          ordinal: 1,
          status: sessionStreamRunStatusResolve(run),
          streamId: run.runId,
        },
      ],
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
        eventType:
          delta.deltaKind === "text"
            ? "text_delta"
            : delta.deltaKind === "thinking"
              ? "thinking_status"
              : "tool_output",
        id: `${run.runId}:${delta.sequence}`,
        payload: delta.deltaKind === "thinking" ? { status: delta.delta } : { delta: delta.delta },
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
  const durableGroups = () => sessionStreamGroupsDerive({ ...feedInput(), delegations: options.delegations() })
  const inFlightScope = () => {
    if (activeSessionId() === undefined) return undefined
    const run = feedInput().runs.find((candidate) => candidate.clientRunId === options.inFlightRunId())
    const attempt = run?.attempts?.at(-1)
    if (run === undefined || attempt?.id === undefined) return undefined
    return { parentAttemptId: attempt.id, parentRunId: run.id }
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
