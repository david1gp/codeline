import { expect, type BrowserContext } from "@playwright/test"
import { e2eExampleDataSeedRestore } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function managedOriginHttpSseCleanup(runId: string, context?: BrowserContext) {
  await context?.close()
  let cleanupError: unknown
  let deletedUserIds: string[] = []
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
    await e2eExampleDataSeedRestore()
  } catch (error) {
    cleanupError = error
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
