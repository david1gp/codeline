import type { SimulateSimulatorPhase } from "./simulateSimulatorState.js"

const simulatePhaseLabels: Record<SimulateSimulatorPhase, string> = {
  aborted: "Aborted",
  failed: "Failed",
  idle: "Idle",
  paused: "Paused",
  retrying: "Retry pending",
  running: "Running",
  succeeded: "Succeeded",
  unexpected_end: "Unexpected end",
}

export function simulatePhaseLabel(phase: SimulateSimulatorPhase): string {
  return simulatePhaseLabels[phase]
}
