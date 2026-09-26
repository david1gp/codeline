import { expect, type BrowserContext } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function managedOriginDiagnosticsIngestionCleanup(
  runId: string,
  context?: BrowserContext,
  diagnostics?: ReturnType<typeof e2eBrowserDiagnosticsInstall>,
) {
  let cleanupError: unknown
  let diagnosticsError: unknown
  let deletedUserIds: string[] = []
  try {
    await diagnostics?.finalize()
  } catch (error) {
    diagnosticsError = error
  }
  try {
    await context?.close()
  } catch (error) {
    cleanupError = error
  }
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
  } catch (error) {
    cleanupError = error
  }
  if (diagnosticsError !== undefined) throw diagnosticsError
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
