type RunCancellationController = {
  abort: () => void
}

type RunCancellationRegistrationInput = {
  controller: RunCancellationController
  runId: string
  sessionId: string
  userId: string
}

type RunCancellationAbortInput = {
  runIds: readonly string[]
  sessionId: string
  userId: string
}

type RunCancellationCoordinator = {
  abort: (input: RunCancellationAbortInput) => readonly string[]
  register: (input: RunCancellationRegistrationInput) => () => void
}

function runCancellationKeyCreate(userId: string, sessionId: string, runId: string): string {
  return JSON.stringify([userId, sessionId, runId])
}

export function runCancellationCoordinatorCreate(): RunCancellationCoordinator {
  const controllers = new Map<string, Set<RunCancellationController>>()
  const cancelledKeys = new Set<string>()

  return {
    abort: ({ runIds, sessionId, userId }) => {
      const signalledRunIds: string[] = []
      const uniqueRunIds = new Set(runIds)

      for (const runId of uniqueRunIds) {
        const key = runCancellationKeyCreate(userId, sessionId, runId)
        if (cancelledKeys.has(key)) continue
        cancelledKeys.add(key)
        const registered = controllers.get(key)
        if (registered === undefined) continue
        for (const controller of registered) controller.abort()
        signalledRunIds.push(runId)
      }

      return signalledRunIds
    },
    register: ({ controller, runId, sessionId, userId }) => {
      const key = runCancellationKeyCreate(userId, sessionId, runId)
      if (cancelledKeys.has(key)) {
        controller.abort()
        return () => undefined
      }
      const registered = controllers.get(key) ?? new Set<RunCancellationController>()
      registered.add(controller)
      controllers.set(key, registered)

      let active = true
      return () => {
        if (!active) return
        active = false
        registered.delete(controller)
        if (registered.size === 0) controllers.delete(key)
      }
    },
  }
}
