import { test } from "@playwright/test"
import { chatCommandExpansionPreSessionStep } from "./chatCommandExpansionPreSessionStep.js"

test("a pre-session command creates its session and submits the expansion once", async ({ browser }) => {
  test.setTimeout(240_000)
  await chatCommandExpansionPreSessionStep(browser)
})
