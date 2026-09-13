import { expect, test } from "bun:test"
import { demoSessionSemanticFixtures } from "../../../src/ui/demo/demoSessionSemanticFixtures.js"

test("session semantic fixtures distinguish completed, generating, and waiting states", () => {
  expect(demoSessionSemanticFixtures.ready.latestAnswer?.content).toContain("Session area refreshed")
  expect(demoSessionSemanticFixtures.ready.steps.length).toBeGreaterThan(0)

  expect(demoSessionSemanticFixtures.streaming.latestAnswer).toBeNull()
  expect(demoSessionSemanticFixtures.streaming.steps.at(-1)?.summary).toContain("preparing the final response")

  expect(demoSessionSemanticFixtures.waiting.compactState?.input?.prompt).toContain("application users")
  expect(demoSessionSemanticFixtures.waiting.steps.at(-1)?.kind).toBe("input")
})
