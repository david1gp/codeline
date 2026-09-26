import { test } from "@playwright/test"
import { newProjectFlowFirstMessageStep } from "./newProjectFlowFirstMessageStep.js"

test("creating a project session sends and persists exactly its first UI message", async ({ browser }) => {
  test.setTimeout(180_000)
  await newProjectFlowFirstMessageStep(browser)
})
