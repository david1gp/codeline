import { test } from "@playwright/test"
import { retryCancellationReloadStepRun } from "./retryCancellationReloadStepRun.js"

test("an existing session shows its immutable captured resource selection across a reload", async ({ browser }) => {
  test.setTimeout(180_000)
  await retryCancellationReloadStepRun(browser, "captured-resources")
})
