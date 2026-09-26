import { test } from "@playwright/test"
import { settledSessionOfflineBrowsingAssert } from "./settledSessionOfflineBrowsingAssert.js"

test("a settled session cached while signed in stays readable signed out and offline", async ({ browser }) => {
  // Deterministic re-seeding and several full navigations exceed the default budget.
  test.setTimeout(180_000)
  await settledSessionOfflineBrowsingAssert(browser)
})
