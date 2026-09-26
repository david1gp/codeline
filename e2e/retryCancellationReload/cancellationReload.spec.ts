import { test } from "@playwright/test"
import { retryCancellationReloadStepRun } from "./retryCancellationReloadStepRun.js"

test("a run cancelled from a reloaded tab settles as aborted without a finalized answer", async ({ browser }) => {
  test.setTimeout(180_000)
  await retryCancellationReloadStepRun(browser, "cancellation")
})
