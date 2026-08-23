import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { runProviderOutputCreate } from "./runProviderOutputCreate.js"

type RunActiveRegistryRegistrationInput = {
  controller?: AbortController
  providerOutput?: ReturnType<typeof runProviderOutputCreate>
  runId: string
  sessionId: string
  userId: string
}

type RunActiveRegistryCancelInput = {
  runIds: readonly string[]
  sessionId: string
  userId: string
}

type RunActiveRegistryLifecycle = {
  readonly runId: string
  readonly sessionId: string
  readonly signal: AbortSignal
  readonly status: "active" | "cancelled"
  readonly userId: string
  readonly providerOutput?: RunActiveRegistryRegistrationInput["providerOutput"]
}

type RunActiveRegistryRegistration = {
  readonly cleanup: () => void
  readonly lifecycle: RunActiveRegistryLifecycle
}

type RunActiveRegistryEntry = {
  readonly abort: () => void
  readonly lifecycle: {
    runId: string
    sessionId: string
    signal: AbortSignal
    status: "active" | "cancelled"
    userId: string
    providerOutput?: RunActiveRegistryRegistrationInput["providerOutput"]
  }
  readonly removeAbortListener: () => void
}

type RunActiveRegistry = {
  cancel: (input: RunActiveRegistryCancelInput) => readonly string[]
  cleanup: (runId: string) => void
  lookup: (runId: string) => RunActiveRegistryLifecycle | undefined
  register: (input: RunActiveRegistryRegistrationInput) => Result<RunActiveRegistryRegistration>
}

function runActiveRegistryKeyCreate(userId: string, sessionId: string, runId: string): string {
  return JSON.stringify([userId, sessionId, runId])
}

export function runActiveRegistryCreate(): RunActiveRegistry {
  const entries = new Map<string, RunActiveRegistryEntry>()
  const cancelledKeys = new Set<string>()

  const cleanup = (runId: string): void => {
    const entry = entries.get(runId)
    if (entry === undefined) return
    entry.removeAbortListener()
    entries.delete(runId)
  }

  const register = (input: RunActiveRegistryRegistrationInput): Result<RunActiveRegistryRegistration> => {
    const op = "runActiveRegistryRegister"
    if (input.runId.length === 0) return createResultError(op, "The run ID is required.")
    if (input.sessionId.length === 0) return createResultError(op, "The session ID is required.")
    if (input.userId.length === 0) return createResultError(op, "The user ID is required.")
    if (entries.has(input.runId)) return createResultError(op, "The run is already registered for execution.")

    const controller = input.controller ?? new AbortController()
    const cancellationKey = runActiveRegistryKeyCreate(input.userId, input.sessionId, input.runId)
    const cancelled = cancelledKeys.has(cancellationKey)
    cancelledKeys.delete(cancellationKey)
    const lifecycle = {
      runId: input.runId,
      sessionId: input.sessionId,
      signal: controller.signal,
      status: cancelled || controller.signal.aborted ? ("cancelled" as const) : ("active" as const),
      providerOutput: input.providerOutput,
      userId: input.userId,
    }
    const onAbort = () => {
      lifecycle.status = "cancelled"
    }
    controller.signal.addEventListener("abort", onAbort, { once: true })
    const entry = {
      abort: () => controller.abort(),
      lifecycle,
      removeAbortListener: () => controller.signal.removeEventListener("abort", onAbort),
    }
    entries.set(input.runId, entry)
    if (cancelled && !controller.signal.aborted) controller.abort()

    let cleaned = false
    return createResult({
      cleanup: () => {
        if (cleaned) return
        cleaned = true
        if (entries.get(input.runId) === entry) cleanup(input.runId)
      },
      lifecycle,
    })
  }

  const cancel = ({ runIds, sessionId, userId }: RunActiveRegistryCancelInput): readonly string[] => {
    const signalledRunIds: string[] = []
    for (const runId of new Set(runIds)) {
      const key = runActiveRegistryKeyCreate(userId, sessionId, runId)
      const entry = entries.get(runId)
      if (entry !== undefined) {
        if (entry.lifecycle.userId !== userId || entry.lifecycle.sessionId !== sessionId) continue
        if (entry.lifecycle.status === "cancelled") continue
        entry.lifecycle.status = "cancelled"
        cancelledKeys.add(key)
        entry.abort()
        signalledRunIds.push(runId)
        continue
      }
      cancelledKeys.add(key)
    }
    return signalledRunIds
  }

  const lookup = (runId: string): RunActiveRegistryLifecycle | undefined => entries.get(runId)?.lifecycle

  return { cancel, cleanup, lookup, register }
}
