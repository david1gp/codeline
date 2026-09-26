import { test } from "@playwright/test"
import { detachedRunReloadStepRun } from "./detachedRunReloadStepRun.js"

test("a submitted prompt starts a detached run that survives reload and completes authoritatively", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  await detachedRunReloadStepRun(browser, "run")
})
