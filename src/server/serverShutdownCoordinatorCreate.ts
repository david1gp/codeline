const SYSTEMD_TIMEOUT_STOP_MS = 30_000
const DEFAULT_DEADLINE_MS = 25_000
const MAX_DEADLINE_MS = SYSTEMD_TIMEOUT_STOP_MS - 1_000

type ServerShutdownCoordinatorCreateOptions = {
  clearTimeout?: (handle: unknown) => void
  deadlineMs?: number
  setTimeout?: (handler: () => void, timeoutMs: number) => unknown
}

type ServerShutdownCleanup = () => Promise<void> | void

type ServerShutdownDiagnostic = {
  error: unknown
  phase: "cleanup" | "deadline"
}

function serverShutdownDeadlineMsResolve(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_DEADLINE_MS
  return Math.min(Math.max(Math.floor(requested), 1), MAX_DEADLINE_MS)
}

export function serverShutdownCoordinatorCreate(options: ServerShutdownCoordinatorCreateOptions = {}) {
  const deadlineMs = serverShutdownDeadlineMsResolve(options.deadlineMs)
  const setTimeoutFn = options.setTimeout ?? ((handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs))
  const clearTimeoutFn =
    options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))
  const shutdownController = new AbortController()
  const shutdownReason = new Error("The Codeline server is shutting down.")
  const registeredControllers = new Set<AbortController>()
  let acceptingAdmission = true
  let shutdownPromise:
    | Promise<{
        diagnostics: {
          deadlineExceeded: boolean
          deadlineMs: number
          errors: readonly ServerShutdownDiagnostic[]
        }
        success: boolean
      }>
    | undefined

  const admit = (): boolean => acceptingAdmission

  const register = (controller: AbortController): (() => void) => {
    if (!acceptingAdmission) {
      controller.abort(shutdownReason)
      return () => undefined
    }

    registeredControllers.add(controller)
    let active = true
    return () => {
      if (!active) return
      active = false
      registeredControllers.delete(controller)
    }
  }

  const shutdown = (cleanup: ServerShutdownCleanup) => {
    if (shutdownPromise !== undefined) return shutdownPromise

    acceptingAdmission = false
    shutdownController.abort(shutdownReason)
    for (const controller of registeredControllers) controller.abort(shutdownReason)
    registeredControllers.clear()

    const errors: ServerShutdownDiagnostic[] = []
    const diagnostics = {
      deadlineExceeded: false,
      deadlineMs,
      errors,
    }
    let cleanupResult: Promise<void> | void
    try {
      cleanupResult = cleanup()
    } catch (error: unknown) {
      cleanupResult = Promise.reject(error)
    }
    const cleanupPromise = Promise.resolve(cleanupResult).then(
      () => ({ completed: true as const }),
      (error: unknown) => {
        errors.push({ error, phase: "cleanup" })
        return { completed: false as const }
      },
    )
    let deadlineHandle: unknown
    const deadlinePromise = new Promise<{ completed: false; timedOut: true }>((resolve) => {
      deadlineHandle = setTimeoutFn(() => {
        const error = new Error(`The application shutdown exceeded its ${deadlineMs}ms deadline.`)
        errors.push({ error, phase: "deadline" })
        diagnostics.deadlineExceeded = true
        resolve({ completed: false, timedOut: true })
      }, deadlineMs)
    })

    shutdownPromise = Promise.race([cleanupPromise, deadlinePromise]).then((outcome) => {
      if (!("timedOut" in outcome) && deadlineHandle !== undefined) clearTimeoutFn(deadlineHandle)
      return {
        diagnostics,
        success: outcome.completed && errors.length === 0,
      }
    })
    return shutdownPromise
  }

  return {
    admit,
    register,
    shutdown,
    signal: shutdownController.signal,
  }
}
