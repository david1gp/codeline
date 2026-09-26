import { test } from "@playwright/test"
import { newProjectFlowNavigationStep } from "./newProjectFlowNavigationStep.js"

test("New Session navigates to the new-session workspace after choosing a project", async ({ browser }) => {
  await newProjectFlowNavigationStep(browser)
})
