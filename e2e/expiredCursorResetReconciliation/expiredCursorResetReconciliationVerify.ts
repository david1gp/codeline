import { type Browser, type BrowserContext } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { expiredCursorSetup } from "./expiredCursorSetup.js"
import { expiredCursorBaselineAssert } from "./expiredCursorBaselineAssert.js"
import { expiredCursorGapCreate } from "./expiredCursorGapCreate.js"
import { expiredCursorRecoveryAssert } from "./expiredCursorRecoveryAssert.js"
import { expiredCursorCacheAssert } from "./expiredCursorCacheAssert.js"
import { expiredCursorCleanup } from "./expiredCursorCleanup.js"

export async function expiredCursorResetReconciliationVerify(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []

  try {
    const setup = await expiredCursorSetup(browser, runId, contexts)
    const { context, page, feedRequests, httpRequests } = setup
    const { recordsBefore, initialSelectedSourceUrl, retainedSelectedCursor } = await expiredCursorBaselineAssert(
      setup,
      runId,
    )
    const postResetTitle = await expiredCursorGapCreate(setup, runId, initialSelectedSourceUrl)
    const reconnectIndex = feedRequests.length
    const reconciliationStart = httpRequests.length
    await context.setOffline(false)

    const { currentSelectedSource, selectedClosedAfterSnapshot } = await expiredCursorRecoveryAssert(
      setup,
      reconnectIndex,
      reconciliationStart,
      retainedSelectedCursor,
      postResetTitle,
    )
    await expiredCursorCacheAssert(setup, recordsBefore, currentSelectedSource, selectedClosedAfterSnapshot)
    await page.close()
  } finally {
    await expiredCursorCleanup(runId, contexts)
  }
}
