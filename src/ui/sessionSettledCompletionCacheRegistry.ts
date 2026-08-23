import { createResult, type Result } from "@adaptive-ds/result"

type SessionSettledCompletionCacheWrite = (snapshot: unknown) => Promise<void>

/**
 * Tab-scoped seam between the one event feed, which owns run-completion
 * checkpoints, and the currently open session's settled cache, which owns the
 * IndexedDB record. Keeping it here avoids threading the per-session cache
 * through the shell while the feed stays a single per-tab owner.
 */
export const sessionSettledCompletionCacheRegistry = (() => {
  const writers = new Set<SessionSettledCompletionCacheWrite>()

  return {
    register: (write: SessionSettledCompletionCacheWrite): (() => void) => {
      writers.add(write)
      return () => {
        writers.delete(write)
      }
    },
    write: async (snapshot: unknown): Promise<Result<void>> => {
      for (const writer of [...writers]) await writer(snapshot)
      return createResult(undefined)
    },
  }
})()
