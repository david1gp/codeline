import { type BrowserContext, test } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { managedOriginBoundedSnapshotAssert } from "./managedOriginBoundedSnapshotAssert.js"
import { managedOriginHttpSseCleanup } from "./managedOriginHttpSseCleanup.js"
import { managedOriginHttpSseSetup } from "./managedOriginHttpSseSetup.js"
import { managedOriginPublicFeedAssert } from "./managedOriginPublicFeedAssert.js"
import { managedOriginSelectedFeedAssert } from "./managedOriginSelectedFeedAssert.js"

test("the managed public origin streams SSE and serves compressed bounded snapshots", async ({ browser }) => {
  test.setTimeout(90_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  try {
    const setup = await managedOriginHttpSseSetup(browser, runId)
    context = setup.context
    const page = await context.newPage()
    await managedOriginPublicFeedAssert(page)
    const cursor = await managedOriginBoundedSnapshotAssert(context, setup.baseOrigin, setup.settledSessionId)
    await managedOriginSelectedFeedAssert(page, setup.settledSessionId, cursor)
    await page.close()
  } finally {
    await managedOriginHttpSseCleanup(runId, context)
  }
})
