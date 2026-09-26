import { e2eExampleDataSeedRestore } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsPurge } from "../e2eMemberSessionsPurge.js"

export async function settledSessionOfflineBrowsingCleanup(runId: string): Promise<string[]> {
  const deletedUserIds = await e2eMemberSessionsPurge(runId)
  await e2eExampleDataSeedRestore()
  return deletedUserIds
}
