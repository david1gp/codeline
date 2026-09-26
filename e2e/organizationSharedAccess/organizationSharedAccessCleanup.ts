import { type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function organizationSharedAccessCleanup(runId: string, contexts: BrowserContext[]): Promise<void> {
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  for (const context of contexts) await context.close()
  try {
    deletedUserIds = await e2eMemberSessionsPurge(runId)
  } catch (error) {
    cleanupError = error
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
