import type { BrowserContext } from "@playwright/test"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function newProjectFlowCleanup(runId: string, contexts: BrowserContext[]): Promise<string[]> {
  for (const context of contexts) await context.close()
  return e2eMemberSessionsPurge(runId)
}
