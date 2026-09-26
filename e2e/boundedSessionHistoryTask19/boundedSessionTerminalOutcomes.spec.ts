import { test } from "@playwright/test"
import { boundedSessionHistoryStepRun } from "./boundedSessionHistoryStepRun.js"

test("seeded terminal outcomes stay exact and child navigation keeps its identity tuple", async ({ browser }) => {
  test.setTimeout(180_000)
  await boundedSessionHistoryStepRun(browser, "terminal-outcomes")
})
