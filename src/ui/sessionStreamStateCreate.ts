import { useQuery } from "@rocicorp/zero/solid"
import { codelineQueries } from "./codelineQueries.js"
import {
  type SessionStreamDelegation,
  type SessionStreamGroup,
  sessionStreamGroupsDerive,
} from "./sessionStreamGroupsDerive.js"
import { sessionStreamInFlightDerive } from "./sessionStreamInFlightDerive.js"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

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
  sessionId: () => string | undefined
}

/**
 * Durable and in-flight stream content for the alternative session display.
 * The Zero queries stay inactive until stream mode is selected so conversation
 * mode keeps its current sync footprint.
 */
export function sessionStreamStateCreate(options: SessionStreamStateOptions) {
  const activeSessionId = () => (options.isEnabled() ? options.sessionId() : undefined)
  const [events, eventsResult] = useQuery(() => {
    const sessionId = activeSessionId()
    return sessionId ? codelineQueries.sessionStreamEvents({ sessionId }) : false
  })
  const [runs] = useQuery(() => {
    const sessionId = activeSessionId()
    return sessionId ? codelineQueries.sessionRuns({ sessionId }) : false
  })
  const durableGroups = () =>
    sessionStreamGroupsDerive({ delegations: options.delegations(), events: events() ?? [], runs: runs() ?? [] })
  const inFlightScope = () => {
    const run = (runs() ?? []).find((candidate) => candidate.clientRunId === options.inFlightRunId())
    const attempt = run?.attempts?.at(-1)
    if (run === undefined || attempt?.id === undefined) return undefined
    return { parentAttemptId: attempt.id, parentRunId: run.id }
  }

  return {
    groups: (): ReadonlyArray<SessionStreamGroup> => {
      const inFlight = sessionStreamInFlightDerive(
        options.inFlightMessages(),
        options.delegations(),
        inFlightScope(),
        runs() ?? [],
      )
      return inFlight === undefined ? durableGroups() : [...durableGroups(), inFlight]
    },
    isLoading: () => activeSessionId() !== undefined && eventsResult().type === "unknown" && events() === undefined,
  }
}

export type SessionStreamState = ReturnType<typeof sessionStreamStateCreate>
