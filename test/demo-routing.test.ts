import { expect, test } from "bun:test"
import { demoScenarioResolve } from "../src/ui/demo/demoScenarioResolve.js"

test("demo routing resolves registered paths and unknown scenarios to welcome", () => {
  expect(demoScenarioResolve("/demo").slug).toBe("welcome")
  expect(demoScenarioResolve("/demo/streaming").slug).toBe("streaming")
  expect(demoScenarioResolve("/demo/not-a-real-scenario").slug).toBe("welcome")
})
