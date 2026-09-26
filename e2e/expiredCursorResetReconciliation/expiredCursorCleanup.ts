import { type BrowserContext, expect } from "@playwright/test"
import { e2eExampleDataSeedRestore } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function expiredCursorCleanup(runId: string, contexts: BrowserContext[]): Promise<void> {
  for (const context of contexts) await context.close()
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
    await e2eExampleDataSeedRestore()
  } catch (error) {
    cleanupError = error
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
