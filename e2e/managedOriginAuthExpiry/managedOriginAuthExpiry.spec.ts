import { type BrowserContext, test } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { managedOriginAuthBaselineAssert } from "./managedOriginAuthBaselineAssert.js"
import { managedOriginAuthExpiryAction } from "./managedOriginAuthExpiryAction.js"
import { managedOriginAuthExpiryAssert } from "./managedOriginAuthExpiryAssert.js"
import { managedOriginAuthExpiryCleanup } from "./managedOriginAuthExpiryCleanup.js"
import { managedOriginAuthExpirySetup } from "./managedOriginAuthExpirySetup.js"

test("an expired identity session severs the event feed and signs the workspace out", async ({ browser }) => {
  // Deterministic re-seeding, a full workspace render, and a feed recycle exceed the default budget.
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  try {
    const setup = await managedOriginAuthExpirySetup(browser, runId)
    context = setup.context
    const page = await context.newPage()
    await managedOriginAuthBaselineAssert(page, setup.settledSessionId)
    await managedOriginAuthExpiryAction(runId, setup.member.userId, context, page, setup.settledSessionId)
    await managedOriginAuthExpiryAssert(page)
  } finally {
    await managedOriginAuthExpiryCleanup(runId, context)
  }
})
