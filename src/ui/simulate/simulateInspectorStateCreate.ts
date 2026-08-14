import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useQuery } from "@rocicorp/zero/solid"
import { codelineQueries } from "../codelineQueries.js"
import type { SessionChatState } from "../sessionChatStateCreate.js"
import { simulateInspectorBackendStateDerive } from "./simulateInspectorBackendStateDerive.js"

type SimulateInspectorOptions = {
  chat: () => SessionChatState
  sessionId: () => string
}

/**
 * Simulation-only comparison of the live frontend transport state against the
 * Zero-synchronized backend run, attempt and stream-event rows for the same
 * session. It reads production queries; it never mirrors client snapshots.
 */
export function simulateInspectorStateCreate(options: SimulateInspectorOptions) {
  const expanded = createSignalObject(false)
  const [run, runResult] = useQuery(() => codelineQueries.latestSessionRun({ sessionId: options.sessionId() }))
  // Stream events stay session-scoped: a session without a persisted run row
  // still records its replayable execution stream.
  const [events, eventsResult] = useQuery(() => codelineQueries.sessionStreamEvents({ sessionId: options.sessionId() }))
  const backend = () =>
    simulateInspectorBackendStateDerive({
      events: events() ?? [],
      run: run(),
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
    isLoading: () => runResult().type === "unknown" || eventsResult().type === "unknown",
    run: () => backend().run,
    streamId: () => backend().streamId,
  }
}

export type SimulateInspectorState = ReturnType<typeof simulateInspectorStateCreate>
