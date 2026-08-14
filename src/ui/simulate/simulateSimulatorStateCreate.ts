import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onCleanup } from "solid-js/dist/solid.js"
import { runRetryAdmissionResolve } from "../../run/actions/runRetryAdmissionResolve.js"
import type { RunFailureMetadata } from "../../run/schema/runFailureMetadataSchema.js"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import type { SimulateScenario, SimulateScenarioAttemptPlan, SimulateScenarioStep } from "./simulateScenario.js"
import type {
  SimulateSimulatorAttempt,
  SimulateSimulatorEmittedEvent,
  SimulateSimulatorSnapshot,
  SimulateSimulatorTermination,
} from "./simulateSimulatorState.js"

type SimulateSimulatorScheduler = {
  clearTimeout: (handle: unknown) => void
  setTimeout: (callback: () => void, delayMs: number) => unknown
}

type SimulateSimulatorStateCreateOptions = {
  scheduler?: SimulateSimulatorScheduler
}

type SimulateSimulatorAction =
  | { dueAtMs: number; kind: "event" }
  | { dueAtMs: number; kind: "retry" }
  | { dueAtMs: number; kind: "unexpected_end" }

const retryDelayMs = 240

function simulateSimulatorInitialAttempt(plan: SimulateScenarioAttemptPlan | undefined): SimulateSimulatorAttempt[] {
  if (plan === undefined) return []
  return [{ events: [], failure: null, ordinal: plan.ordinal, retryAdmission: null, status: "accepted" }]
}

function simulateSimulatorInitialSnapshot(scenario: SimulateScenario): SimulateSimulatorSnapshot {
  return {
    attempts: simulateSimulatorInitialAttempt(scenario.attempts[0]),
    currentAttemptOrdinal: scenario.attempts[0]?.ordinal ?? null,
    elapsedMs: 0,
    events: [],
    lastFailure: null,
    lastTermination: "none",
    phase: "idle",
    runStatus: "accepted",
  }
}

export function simulateSimulatorStateCreate(
  scenario: SimulateScenario,
  options: SimulateSimulatorStateCreateOptions = {},
) {
  const scheduler = options.scheduler ?? {
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
  }
  const snapshot = createSignalObject(simulateSimulatorInitialSnapshot(scenario))
  let action: SimulateSimulatorAction | null = null
  let currentPlanIndex = 0
  let currentStepIndex = 0
  let isRunning = false
  let timerHandle: unknown = null

  const timerClear = () => {
    if (timerHandle === null) return
    scheduler.clearTimeout(timerHandle)
    timerHandle = null
  }

  const snapshotSet = (next: SimulateSimulatorSnapshot) => snapshot.set(next)

  const currentPlanRead = () => scenario.attempts[currentPlanIndex]

  const currentAttemptRead = () => snapshot.get().attempts.at(-1)

  const attemptUpdate = (update: (attempt: SimulateSimulatorAttempt) => SimulateSimulatorAttempt) => {
    const current = snapshot.get()
    const attempt = current.attempts.at(-1)
    if (attempt === undefined) return
    snapshotSet({
      ...current,
      attempts: [...current.attempts.slice(0, -1), update(attempt)],
    })
  }

  const actionSchedule = (kind: SimulateSimulatorAction["kind"], dueAtMs: number) => {
    action = { dueAtMs, kind }
  }

  const currentStepRead = (): SimulateScenarioStep | undefined => currentPlanRead()?.steps[currentStepIndex]

  const currentEventSchedule = (fromMs: number) => {
    const step = currentStepRead()
    if (step === undefined) {
      actionSchedule("unexpected_end", fromMs)
      return
    }
    actionSchedule("event", fromMs + step.delayMs)
  }

  const failureFromTerminal = (event: ExecutionStreamEvent): RunFailureMetadata => {
    if (event.eventType === "terminal") {
      return {
        code: event.payload.code ?? "execution_failed",
        message: event.payload.message ?? "The deterministic execution failed.",
      }
    }
    return { code: "stream_disconnected", message: "The deterministic stream ended before a terminal event." }
  }

  const emittedEventAdd = (event: ExecutionStreamEvent, elapsedMs: number) => {
    const attempt = currentAttemptRead()
    if (attempt === undefined) return
    const current = snapshot.get()
    const emitted: SimulateSimulatorEmittedEvent = {
      attemptOrdinal: attempt.ordinal,
      elapsedMs,
      event,
      sequence: current.events.length + 1,
    }
    snapshotSet({
      ...current,
      attempts: [...current.attempts.slice(0, -1), { ...attempt, events: [...attempt.events, event] }],
      events: [...current.events, emitted],
    })
  }

  const terminalFinish = (event: ExecutionStreamEvent, elapsedMs: number) => {
    const attempt = currentAttemptRead()
    if (attempt === undefined || event.eventType !== "terminal") return
    const status = event.payload.status
    const termination: SimulateSimulatorTermination = status === "completed" ? "completed" : status
    if (status === "completed") {
      isRunning = false
      action = null
      snapshotSet({
        ...snapshot.get(),
        lastTermination: termination,
        phase: "succeeded",
        runStatus: "succeeded",
      })
      attemptUpdate((currentAttempt) => ({ ...currentAttempt, status: "succeeded" }))
      return
    }
    if (status === "aborted") {
      isRunning = false
      action = null
      snapshotSet({
        ...snapshot.get(),
        lastTermination: termination,
        phase: "aborted",
        runStatus: "aborted",
      })
      attemptUpdate((currentAttempt) => ({ ...currentAttempt, status: "aborted" }))
      return
    }

    const failure = failureFromTerminal(event)
    const admission = runRetryAdmissionResolve({
      attemptOrdinal: attempt.ordinal,
      attemptStatus: "failed",
      budget: { maxAttempts: scenario.maxAttempts },
      failure,
    })
    if (!admission.success) {
      isRunning = false
      action = null
      snapshotSet({
        ...snapshot.get(),
        lastFailure: failure,
        lastTermination: "error",
        phase: "failed",
        runStatus: "failed",
      })
      attemptUpdate((currentAttempt) => ({ ...currentAttempt, failure, status: "failed" }))
      return
    }

    attemptUpdate((currentAttempt) => ({
      ...currentAttempt,
      failure,
      retryAdmission: admission.data,
      status: "failed",
    }))
    const nextPlanAvailable = scenario.attempts[currentPlanIndex + 1] !== undefined
    if (admission.data.decision === "retry" && nextPlanAvailable) {
      actionSchedule("retry", elapsedMs + retryDelayMs)
      snapshotSet({
        ...snapshot.get(),
        lastFailure: failure,
        lastTermination: "error",
        phase: "retrying",
        runStatus: "running",
      })
      return
    }

    isRunning = false
    action = null
    snapshotSet({
      ...snapshot.get(),
      lastFailure: failure,
      lastTermination: "error",
      phase: "failed",
      runStatus: "failed",
    })
  }

  const unexpectedEndFinish = (elapsedMs: number) => {
    const attempt = currentAttemptRead()
    if (attempt === undefined) return
    const failure: RunFailureMetadata = {
      code: "stream_disconnected",
      message: "The deterministic stream ended before a terminal event.",
    }
    const admission = runRetryAdmissionResolve({
      attemptOrdinal: attempt.ordinal,
      attemptStatus: "failed",
      budget: { maxAttempts: scenario.maxAttempts },
      failure,
    })
    if (!admission.success) {
      isRunning = false
      action = null
      snapshotSet({
        ...snapshot.get(),
        lastFailure: failure,
        lastTermination: "unexpected_end",
        phase: "unexpected_end",
        runStatus: "failed",
      })
      attemptUpdate((currentAttempt) => ({ ...currentAttempt, failure, status: "failed" }))
      return
    }

    attemptUpdate((currentAttempt) => ({
      ...currentAttempt,
      failure,
      retryAdmission: admission.data,
      status: "failed",
    }))
    const nextPlanAvailable = scenario.attempts[currentPlanIndex + 1] !== undefined
    if (admission.data.decision === "retry" && nextPlanAvailable) {
      actionSchedule("retry", elapsedMs + retryDelayMs)
      snapshotSet({
        ...snapshot.get(),
        lastFailure: failure,
        lastTermination: "unexpected_end",
        phase: "retrying",
        runStatus: "running",
      })
      return
    }

    isRunning = false
    action = null
    snapshotSet({
      ...snapshot.get(),
      lastFailure: failure,
      lastTermination: "unexpected_end",
      phase: "unexpected_end",
      runStatus: "failed",
    })
  }

  const retryStart = (elapsedMs: number) => {
    const nextPlan = scenario.attempts[currentPlanIndex + 1]
    if (nextPlan === undefined) {
      isRunning = false
      action = null
      snapshotSet({ ...snapshot.get(), phase: "failed", runStatus: "failed" })
      return
    }
    currentPlanIndex += 1
    currentStepIndex = 0
    const current = snapshot.get()
    snapshotSet({
      ...current,
      attempts: [
        ...current.attempts,
        { events: [], failure: null, ordinal: nextPlan.ordinal, retryAdmission: null, status: "running" },
      ],
      currentAttemptOrdinal: nextPlan.ordinal,
      phase: "running",
      runStatus: "running",
    })
    currentEventSchedule(elapsedMs)
  }

  const actionProcess = (atMs: number) => {
    if (action === null) return
    const currentAction = action
    action = null
    if (currentAction.kind === "retry") {
      retryStart(atMs)
      return
    }
    if (currentAction.kind === "unexpected_end") {
      unexpectedEndFinish(atMs)
      return
    }
    const step = currentStepRead()
    if (step === undefined) {
      unexpectedEndFinish(atMs)
      return
    }
    currentStepIndex += 1
    emittedEventAdd(step.event, atMs)
    if (step.event.eventType === "terminal") {
      terminalFinish(step.event, atMs)
      return
    }
    currentEventSchedule(atMs)
  }

  const timerSchedule = () => {
    timerClear()
    if (!isRunning || action === null) return
    const delayMs = Math.max(0, action.dueAtMs - snapshot.get().elapsedMs)
    timerHandle = scheduler.setTimeout(() => {
      timerHandle = null
      advance(delayMs)
    }, delayMs)
  }

  const advance = (deltaMs: number) => {
    if (!isRunning || !Number.isFinite(deltaMs) || deltaMs < 0) return
    timerClear()
    const elapsedMs = snapshot.get().elapsedMs + deltaMs
    snapshotSet({ ...snapshot.get(), elapsedMs })
    while (isRunning && action !== null && action.dueAtMs <= elapsedMs) {
      actionProcess(action.dueAtMs)
    }
    timerSchedule()
  }

  const play = () => {
    if (isRunning || ["succeeded", "failed", "unexpected_end", "aborted"].includes(snapshot.get().phase)) return
    isRunning = true
    const current = snapshot.get()
    if (current.phase === "idle" || current.phase === "paused") {
      snapshotSet({
        ...current,
        attempts: current.attempts.map((attempt, index) =>
          index === current.attempts.length - 1 && attempt.status === "accepted"
            ? { ...attempt, status: "running" as const }
            : attempt,
        ),
        phase: "running",
        runStatus: "running",
      })
    }
    if (action === null) currentEventSchedule(snapshot.get().elapsedMs)
    timerSchedule()
  }

  const pause = () => {
    if (!isRunning) return
    isRunning = false
    timerClear()
    snapshotSet({ ...snapshot.get(), phase: "paused" })
  }

  const stop = () => {
    if (["succeeded", "failed", "unexpected_end", "aborted"].includes(snapshot.get().phase)) return
    timerClear()
    isRunning = false
    action = null
    const event: ExecutionStreamEvent = {
      eventType: "terminal",
      payload: {
        code: "chat_interrupted",
        message: "The deterministic simulation was cancelled by the operator.",
        status: "aborted",
      },
    }
    const elapsedMs = snapshot.get().elapsedMs
    emittedEventAdd(event, elapsedMs)
    snapshotSet({ ...snapshot.get(), lastTermination: "aborted", phase: "aborted", runStatus: "aborted" })
    attemptUpdate((attempt) => ({ ...attempt, status: "aborted" }))
  }

  const retry = () => {
    if (action?.kind !== "retry") return
    timerClear()
    action = { dueAtMs: snapshot.get().elapsedMs, kind: "retry" }
    isRunning = true
    snapshotSet({ ...snapshot.get(), phase: "retrying", runStatus: "running" })
    advance(0)
  }

  const reset = () => {
    timerClear()
    isRunning = false
    action = null
    currentPlanIndex = 0
    currentStepIndex = 0
    snapshotSet(simulateSimulatorInitialSnapshot(scenario))
  }

  onCleanup(timerClear)

  return {
    advance,
    pause,
    play,
    reset,
    retry,
    snapshot: snapshot.get,
    stop,
  }
}
