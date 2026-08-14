import type { SimulateScenario } from "./simulateScenario.js"
import { simulateScenarioFixtures } from "./simulateScenarioFixtures.js"

export const simulateScenarioRegistry = [
  simulateScenarioFixtures.streaming,
  simulateScenarioFixtures["thinking-tools"],
  simulateScenarioFixtures["retry-success"],
  simulateScenarioFixtures["retry-exhausted"],
  simulateScenarioFixtures["terminal-error"],
  simulateScenarioFixtures["unexpected-end"],
  simulateScenarioFixtures.cancellation,
] as const satisfies readonly SimulateScenario[]
