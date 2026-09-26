import { type BrowserContext, test } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { managedOriginDiagnosticsMetricsAssert } from "./managedOriginDiagnosticsMetricsAssert.js"
import { managedOriginDiagnosticsMetricsCleanup } from "./managedOriginDiagnosticsMetricsCleanup.js"
import { managedOriginDiagnosticsMetricsSetup } from "./managedOriginDiagnosticsMetricsSetup.js"

test("the managed diagnostics metrics report event feed counters", async ({ browser }) => {
  test.setTimeout(90_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  try {
    const setup = await managedOriginDiagnosticsMetricsSetup(browser, runId)
    context = setup.context
    await managedOriginDiagnosticsMetricsAssert(browser, context, setup.baseOrigin)
  } finally {
    await managedOriginDiagnosticsMetricsCleanup(runId, context)
  }
})
