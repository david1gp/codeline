type RunGracefulCancelKey = {
  runId: string
  sessionId: string
  userId: string
}

function runGracefulCancelKeyCreate(input: RunGracefulCancelKey): string {
  return JSON.stringify([input.userId, input.sessionId, input.runId])
}

/**
 * Tracks "finish the current tool, then stop" cancellation requests. Unlike
 * the abort-based coordinators, requesting here never signals anything: the
 * running tool loop observes the flag at the next safe boundary (no tool in
 * flight) and aborts there, so in-flight file writes, bash commands, and
 * child delegations complete and persist before the run terminates.
 */
export function runGracefulCancelRegistryCreate() {
  const requestedKeys = new Set<string>()

  const request = (input: RunGracefulCancelKey): void => {
    requestedKeys.add(runGracefulCancelKeyCreate(input))
  }

  const isRequested = (input: RunGracefulCancelKey): boolean => {
    return requestedKeys.has(runGracefulCancelKeyCreate(input))
  }

  const clear = (input: RunGracefulCancelKey): void => {
    requestedKeys.delete(runGracefulCancelKeyCreate(input))
  }

  return { clear, isRequested, request }
}

export type RunGracefulCancelRegistry = ReturnType<typeof runGracefulCancelRegistryCreate>
