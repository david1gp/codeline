import { type BrowserContext, expect } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function lunaLowEffortChatCleanup(
  runId: string,
  context: BrowserContext | undefined,
  diagnostics: ReturnType<typeof e2eBrowserDiagnosticsInstall> | undefined,
): Promise<void> {
  let diagnosticsError: unknown
  let cleanupError: unknown
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
