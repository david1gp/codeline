import { type BrowserContext, test } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { managedOriginDiagnosticsIngestionAction } from "./managedOriginDiagnosticsIngestionAction.js"
import { managedOriginDiagnosticsIngestionAssert } from "./managedOriginDiagnosticsIngestionAssert.js"
import { managedOriginDiagnosticsIngestionCleanup } from "./managedOriginDiagnosticsIngestionCleanup.js"
import { managedOriginDiagnosticsIngestionSetup } from "./managedOriginDiagnosticsIngestionSetup.js"

test("the managed preview ingests sanitized browser diagnostics in run-owned storage", async ({ browser }) => {
  test.setTimeout(120_000)
  const runId = e2eRunIdCreate()
  const resources: { context?: BrowserContext; diagnostics?: ReturnType<typeof e2eBrowserDiagnosticsInstall> } = {}
  try {
    const setup = await managedOriginDiagnosticsIngestionSetup(browser, runId, resources)
    await managedOriginDiagnosticsIngestionAction(
      setup.page,
      setup.baseOrigin,
      setup.failedPath,
      setup.marker,
      setup.secret,
    )
    await managedOriginDiagnosticsIngestionAssert(
      runId,
      setup.marker,
      setup.failedPath,
      setup.secret,
      setup.member.userId,
    )
    await setup.context.unroute(setup.routePattern)
  } finally {
    await managedOriginDiagnosticsIngestionCleanup(runId, resources.context, resources.diagnostics)
  }
})
