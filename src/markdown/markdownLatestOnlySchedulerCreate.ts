type MarkdownLatestOnlySchedulerOptions<T, R> = {
  run: (value: T) => Promise<R> | R
  onComplete?: (value: T, result: R) => void
  onError?: (error: unknown, value: T) => void
}

type MarkdownLatestOnlySchedulerPending<T> = {
  value: T
}

type MarkdownLatestOnlySchedulerActive<T> = {
  id: number
  value: T
}

/** Runs one value at a time and keeps only the newest value received while running. */
export function markdownLatestOnlySchedulerCreate<T, R>(options: MarkdownLatestOnlySchedulerOptions<T, R>) {
  let active: MarkdownLatestOnlySchedulerActive<T> | undefined
  let pending: MarkdownLatestOnlySchedulerPending<T> | undefined
  let disposed = false
  let nextId = 0
  const idleWaiters = new Set<() => void>()

  const idleResolve = (): void => {
    if (active !== undefined || pending !== undefined) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  const idle = (): Promise<void> => {
    if (active === undefined && pending === undefined) return Promise.resolve()
    return new Promise((resolve) => idleWaiters.add(resolve))
  }

  const executionRun = async (current: MarkdownLatestOnlySchedulerActive<T>): Promise<void> => {
    let outcome: { success: true; result: R } | { success: false; error: unknown }
    try {
      outcome = { success: true, result: await options.run(current.value) }
    } catch (error) {
      outcome = { success: false, error }
    }

    if (!disposed && active?.id === current.id) {
      try {
        if (outcome.success) options.onComplete?.(current.value, outcome.result)
        else options.onError?.(outcome.error, current.value)
      } catch {
        // A consumer callback must not stop the scheduler from continuing.
      }
    }

    if (active?.id !== current.id) return
    active = undefined
    if (disposed) {
      pending = undefined
      idleResolve()
      return
    }

    const next = pending
    pending = undefined
    if (next === undefined) {
      idleResolve()
      return
    }

    active = { id: ++nextId, value: next.value }
    void executionRun(active)
  }

  const schedule = (value: T): void => {
    if (disposed) return
    if (active !== undefined) {
      pending = { value }
      return
    }
    active = { id: ++nextId, value }
    void executionRun(active)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    pending = undefined
    idleResolve()
  }

  return {
    dispose,
    idle,
    inFlight: (): boolean => active !== undefined,
    pending: (): boolean => pending !== undefined,
    schedule,
  }
}
