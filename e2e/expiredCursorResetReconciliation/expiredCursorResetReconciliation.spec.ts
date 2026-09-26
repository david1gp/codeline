import { test } from "@playwright/test"
import { expiredCursorResetReconciliationVerify } from "./expiredCursorResetReconciliationVerify.js"

test("an expired SSE cursor resets the feed and reconciles without discarding cached sessions", async ({ browser }) => {
  test.setTimeout(180_000)
  await expiredCursorResetReconciliationVerify(browser)
})
