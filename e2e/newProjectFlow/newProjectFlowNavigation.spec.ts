import { test } from "@playwright/test"
import { newProjectFlowNavigationStep } from "./newProjectFlowNavigationStep.js"

test("New Session navigates directly to the new-session workspace", async ({ browser }) => {
  await newProjectFlowNavigationStep(browser)
})
