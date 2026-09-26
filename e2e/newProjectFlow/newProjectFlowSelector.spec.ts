import { test } from "@playwright/test"
import { newProjectFlowSelectorStep } from "./newProjectFlowSelectorStep.js"

test("the new-session project selector opens the New Project dialog after an empty search", async ({ browser }) => {
  await newProjectFlowSelectorStep(browser)
})
