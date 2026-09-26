import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function chatCommandExpansionCleanup(runId: string): Promise<string[]> {
  return e2eMemberSessionsPurge(runId)
}
