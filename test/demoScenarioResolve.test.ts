import { expect, test } from "bun:test"
import { demoCatalogRouteResolve } from "../src/ui/demo/demoCatalogRouteResolve.js"
import { demoScenarioResolve } from "../src/ui/demo/demoScenarioResolve.js"
import { demoScenarioFixtures } from "../src/ui/demo/demoScenarioFixtures.js"

test("demo routing resolves registered paths and unknown scenarios to welcome", () => {
  expect(demoScenarioResolve("/demo").slug).toBe("welcome")
  expect(demoScenarioResolve("/demo/streaming").slug).toBe("streaming")
  expect(demoScenarioResolve("/demo/not-a-real-scenario").slug).toBe("welcome")
})

test("session workspace scenarios resolve to distinct production states", () => {
  const expected = [
    ["session-completed", "ready", "ready"],
    ["session-generating", "streaming", "editing"],
    ["session-waiting", "waiting", "empty"],
    ["session-error", "error", "error"],
    ["session-loading", "loading", "loading"],
    ["session-empty", "empty", "empty"],
  ] as const

  for (const [slug, sessionVariant, browserVariant] of expected) {
    expect(demoScenarioResolve(`/demo/${slug}`).slug).toBe(slug)
    expect(demoCatalogRouteResolve(`/demo/screens/${slug}`)).toMatchObject({
      kind: "scenario",
      scenario: { slug },
    })
    expect(demoScenarioFixtures[slug].sessionWorkspace).toMatchObject({ browserVariant, sessionVariant })
  }
})
