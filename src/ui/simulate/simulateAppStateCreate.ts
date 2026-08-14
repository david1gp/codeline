import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useLocation } from "@solidjs/router"
import { createMemo } from "solid-js/dist/solid.js"
import { simulateScenarioResolve } from "./simulateScenarioResolve.js"
import { simulateSimulatorStateCreate } from "./simulateSimulatorStateCreate.js"
import { simulateSpeedOptions } from "./simulateSpeedOptions.js"

const terminalPhases = ["succeeded", "failed", "unexpected_end", "aborted"]

export function simulateAppStateCreate() {
  const location = useLocation()
  const speed = createSignalObject(1)
  const scenario = createMemo(() => simulateScenarioResolve(location.pathname))

  const simulator = createMemo(() =>
    simulateSimulatorStateCreate(scenario(), {
      scheduler: {
        clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
        setTimeout: (callback: () => void, delayMs: number) =>
          globalThis.setTimeout(callback, Math.round(delayMs / speed.get())),
      },
    }),
  )

  const snapshot = () => simulator().snapshot()
  const phase = () => snapshot().phase
  const isTerminal = () => terminalPhases.includes(phase())

  return {
    assistantText: () =>
      snapshot()
        .events.filter((emitted) => emitted.event.eventType === "text_delta")
        .map((emitted) => (emitted.event.eventType === "text_delta" ? emitted.event.payload.delta : ""))
        .join(""),
    canPause: () => phase() === "running" || phase() === "retrying",
    canPlay: () => !isTerminal() && phase() !== "running" && phase() !== "retrying",
    canReset: () => phase() !== "idle" || snapshot().events.length > 0,
    canRetry: () => phase() === "retrying",
    canStop: () => !isTerminal(),
    pause: () => simulator().pause(),
    play: () => simulator().play(),
    reset: () => simulator().reset(),
    retry: () => simulator().retry(),
    scenario,
    snapshot,
    speed,
    speedOptions: simulateSpeedOptions,
    stop: () => simulator().stop(),
  }
}
