import { createResult, type Result } from "@adaptive-ds/result"
import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { httpQueryStateCreate } from "../httpQueryStateCreate.js"
import type { SessionChatState } from "../sessionChatStateCreate.js"
import { simulateInspectorBackendStateDerive } from "./simulateInspectorBackendStateDerive.js"

type SimulateInspectorAttempt = {
  id: string
  ordinal: number
  status: string
  streamId: string
}

type SimulateInspectorRun = {
  attempts: ReadonlyArray<SimulateInspectorAttempt>
  cancellationKind?: string | null
  createdAt: number
  id: string
  status: string
  streamId: string
}

type SimulateInspectorStreamEvent = {
  eventType: string
  streamId: string
}

type SimulateInspectorSnapshot = {
  events: ReadonlyArray<SimulateInspectorStreamEvent>
  runs: ReadonlyArray<SimulateInspectorRun>
}

type SimulateInspectorOptions = {
  chat: () => SessionChatState
  load?: (sessionId: string, signal: AbortSignal) => Promise<Result<SimulateInspectorSnapshot>>
  sessionId: () => string
}

function simulateInspectorSnapshotEmpty(): Result<SimulateInspectorSnapshot> {
  return createResult({ events: [], runs: [] })
}

function simulateInspectorLatestRunResolve(
  runs: ReadonlyArray<SimulateInspectorRun>,
): SimulateInspectorRun | undefined {
  const latest = [...runs].sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))[0]
  if (latest === undefined) return undefined
  return {
    ...latest,
    attempts: [...latest.attempts].sort(
      (left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id),
    ),
  }
}

/**
 * Simulation-only comparison of the live frontend transport state against the
 * HTTP run snapshot and stream replay rows for the same session. The loader is
 * injected until the HTTP API exposes session-run enumeration; it never mirrors
 * client snapshots.
 */
export function simulateInspectorStateCreate(options: SimulateInspectorOptions) {
  const expanded = createSignalObject(false)
  const backendQuery = httpQueryStateCreate({
    key: options.sessionId,
    load: (sessionId, signal) => options.load?.(sessionId, signal) ?? Promise.resolve(simulateInspectorSnapshotEmpty()),
  })
  const backend = () =>
    simulateInspectorBackendStateDerive({
      events: backendQuery.data()?.events ?? [],
      run: simulateInspectorLatestRunResolve(backendQuery.data()?.runs ?? []),
    })

  return {
    attempts: () => backend().attempts,
    eventCounts: () => backend().eventCounts,
    eventTotal: () => backend().eventTotal,
    expandedToggle: () => expanded.set(!expanded.get()),
    frontend: () => ({
      attemptCount: options.chat().attemptCount(),
      failures: options.chat().failures(),
      isAborted: options.chat().isAborted(),
      isBusy: options.chat().isBusy(),
      isThinking: options.chat().isThinking(),
      recoveryStatus: options.chat().recoveryStatus(),
    }),
    isExpanded: expanded.get,
    isLoading: () => backendQuery.isLoading() && backendQuery.data() === undefined,
    run: () => backend().run,
    streamId: () => backend().streamId,
  }
}

export type SimulateInspectorState = ReturnType<typeof simulateInspectorStateCreate>
