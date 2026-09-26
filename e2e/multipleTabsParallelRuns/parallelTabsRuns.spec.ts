import { test } from "@playwright/test"
import { multipleTabsParallelRunsStepRun } from "./multipleTabsParallelRunsStepRun.js"

test("two tabs run parallel deterministic runs over one event feed each without cross-tab corruption", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  await multipleTabsParallelRunsStepRun(browser, "parallel")
})
