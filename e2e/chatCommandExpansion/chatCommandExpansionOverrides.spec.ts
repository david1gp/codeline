import { test } from "@playwright/test"
import { chatCommandExpansionOverridesStep } from "./chatCommandExpansionOverridesStep.js"

test("enabled bash interpolation, subtask, and model overrides expand into the persisted turn", async ({ browser }) => {
  test.setTimeout(240_000)
  await chatCommandExpansionOverridesStep(browser)
})
