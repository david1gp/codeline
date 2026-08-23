import { createResult, type Result } from "@adaptive-ds/result"
import {
  type SessionStreamDelegation,
  type SessionStreamGroup,
  sessionStreamGroupsDerive,
} from "./sessionStreamGroupsDerive.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import { sessionStreamInFlightDerive } from "./sessionStreamInFlightDerive.js"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

type SessionStreamInput = Parameters<typeof sessionStreamGroupsDerive>[0]
type SessionStreamSnapshot = Pick<SessionStreamInput, "events" | "runs">

type SessionStreamStateOptions = {
  delegations: () => ReadonlyArray<SessionStreamDelegation>
  inFlightRunId: () => string | null
  inFlightMessages: () => ReadonlyArray<{
    activities?: ReadonlyArray<TransientActivity>
    content: string
    id?: string
    role: string
  }>
  isEnabled: () => boolean
  load?: (sessionId: string, signal: AbortSignal) => Promise<Result<SessionStreamSnapshot>>
  sessionId: () => string | undefined
}

function sessionStreamEmptyLoad(): Result<SessionStreamSnapshot> {
  return createResult({ events: [], runs: [] })
}

/**
 * Durable and in-flight stream content for the alternative session display.
 * The HTTP snapshot/replay loader stays inactive until stream mode is selected
 * so conversation mode keeps its current network footprint. Live event-feed
 * reconciliation is deliberately owned by the later feed-wiring increment.
 */
export function sessionStreamStateCreate(options: SessionStreamStateOptions) {
  const activeSessionId = () => (options.isEnabled() ? options.sessionId() : undefined)
  const streamQuery = httpQueryStateCreate({
    enabled: options.isEnabled,
    key: options.sessionId,
    load: (sessionId, signal) => options.load?.(sessionId, signal) ?? Promise.resolve(sessionStreamEmptyLoad()),
  })
  const durableGroups = () =>
    sessionStreamGroupsDerive({
      delegations: options.delegations(),
      events: streamQuery.data()?.events ?? [],
      runs: streamQuery.data()?.runs ?? [],
    })
  const inFlightScope = () => {
    if (activeSessionId() === undefined) return undefined
    const run = (streamQuery.data()?.runs ?? []).find((candidate) => candidate.clientRunId === options.inFlightRunId())
    const attempt = run?.attempts?.at(-1)
    if (run === undefined || attempt?.id === undefined) return undefined
    return { parentAttemptId: attempt.id, parentRunId: run.id }
  }
  const revalidate = () => {
    if (activeSessionId() === undefined) return
    streamQuery.refresh()
  }

  return {
    groups: (): ReadonlyArray<SessionStreamGroup> => {
      const inFlight = sessionStreamInFlightDerive(
        options.inFlightMessages(),
        options.delegations(),
        inFlightScope(),
        streamQuery.data()?.runs ?? [],
      )
      return inFlight === undefined ? durableGroups() : [...durableGroups(), inFlight]
    },
    isLoading: () => activeSessionId() !== undefined && streamQuery.isLoading() && streamQuery.data() === undefined,
    refresh: revalidate,
    revalidate,
  }
}

export type SessionStreamState = ReturnType<typeof sessionStreamStateCreate>
