import { expect, type BrowserContext } from "@playwright/test"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function managedOriginDiagnosticsMetricsCleanup(runId: string, context?: BrowserContext) {
  await context?.close()
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
  } catch (error) {
    cleanupError = error
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
