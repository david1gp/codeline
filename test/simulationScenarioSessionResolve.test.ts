import { expect, test } from "bun:test"
import { appKnownRouteResolve } from "../src/app/appKnownRouteResolve.js"
import { simulationScenarioSessionMetadata } from "../src/simulation/simulationScenarioSessionMetadata.js"
import { simulationScenarioSessionResolve } from "../src/simulation/simulationScenarioSessionResolve.js"

test("simulation routes select their seeded session and unknown routes fall back to streaming", () => {
  for (const scenario of Object.values(simulationScenarioSessionMetadata)) {
    expect(simulationScenarioSessionResolve(scenario.href)).toBe(scenario)
    expect(appKnownRouteResolve(scenario.href)).toBe(true)
  }

  expect(simulationScenarioSessionResolve("/simulate")).toMatchObject({
    href: "/simulate/streaming",
    sessionId: simulationScenarioSessionMetadata.streaming.sessionId,
  })
  expect(simulationScenarioSessionResolve("/simulate/").sessionId).toBe(
    simulationScenarioSessionMetadata.streaming.sessionId,
  )
  expect(simulationScenarioSessionResolve("/simulate/retry-success").sessionId).toBe(
    simulationScenarioSessionMetadata["retry-success"].sessionId,
  )
  expect(simulationScenarioSessionResolve("/simulate/unknown").sessionId).toBe(
    simulationScenarioSessionMetadata.streaming.sessionId,
  )
  expect(appKnownRouteResolve("/simulate/unknown")).toBe(false)
})
