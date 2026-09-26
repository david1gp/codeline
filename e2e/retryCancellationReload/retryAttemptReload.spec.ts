import { test } from "@playwright/test"
import { retryCancellationReloadStepRun } from "./retryCancellationReloadStepRun.js"

test("a retryable attempt is replaced across a reload and only the authoritative attempt is finalized", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  await retryCancellationReloadStepRun(browser, "retry")
})
