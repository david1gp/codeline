import { test } from "@playwright/test"
import { boundedSessionHistoryStepRun } from "./boundedSessionHistoryStepRun.js"

test("bounded history loads one page, fixes older-page watermarks, and lazily loads details", async ({ browser }) => {
  test.setTimeout(240_000)
  await boundedSessionHistoryStepRun(browser, "page")
})
