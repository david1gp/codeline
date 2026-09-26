import { test } from "@playwright/test"
import { detachedRunReloadStepRun } from "./detachedRunReloadStepRun.js"

test("a reload during open tool activity reattaches the run and observes the tool call completing", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  await detachedRunReloadStepRun(browser, "tool-activity")
})
