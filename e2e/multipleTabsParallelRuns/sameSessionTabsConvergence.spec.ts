import { test } from "@playwright/test"
import { multipleTabsParallelRunsStepRun } from "./multipleTabsParallelRunsStepRun.js"

test("two tabs on the same session converge on one authoritative transcript for one detached run", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  await multipleTabsParallelRunsStepRun(browser, "convergence")
})
