import { expect, test } from "bun:test"
import { simulateScenarioRegistry } from "../src/ui/simulate/simulateScenarioRegistry.js"
import { simulateScenarioResolve } from "../src/ui/simulate/simulateScenarioResolve.js"

test("simulation scenario registry contains every direct scenario route in stable order", () => {
  expect(simulateScenarioRegistry.map((scenario) => scenario.slug)).toEqual([
    "streaming",
    "thinking-tools",
    "retry-success",
    "retry-exhausted",
    "terminal-error",
    "unexpected-end",
    "cancellation",
  ])
})

test("simulation scenario resolution handles the home route, direct routes, and unknown routes", () => {
  const defaultScenario = simulateScenarioRegistry[0]!

  expect(simulateScenarioResolve("/simulate")).toBe(defaultScenario)
  expect(simulateScenarioResolve("/simulate/")).toBe(defaultScenario)
  expect(simulateScenarioResolve("/simulate/thinking-tools")).toBe(simulateScenarioRegistry[1])
  expect(simulateScenarioResolve("/simulate/retry-success")).toBe(simulateScenarioRegistry[2])
  expect(simulateScenarioResolve("/simulate/not-a-real-scenario")).toBe(defaultScenario)
})
