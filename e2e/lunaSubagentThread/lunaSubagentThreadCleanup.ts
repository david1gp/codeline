import { type BrowserContext, expect } from "@playwright/test"
import { e2eExampleDataSeedRestore } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function lunaSubagentThreadCleanup(runId: string, contexts: BrowserContext[]): Promise<void> {
  let cleanupError: unknown
  for (const context of contexts) {
    try {
      await context.close()
    } catch (error) {
      cleanupError ??= error
    }
  }
  let deletedUserIds: string[] = []
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
  } catch (error) {
    cleanupError ??= error
  }
  try {
    await e2eExampleDataSeedRestore()
  } catch (error) {
    cleanupError ??= error
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
