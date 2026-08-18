import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

const execFileAsync = promisify(execFile)

/**
 * Removes the run's synthetic identities and everything cascading from them.
 * It runs from a fixture teardown, so a failed assertion still leaves the local
 * development database in its pre-run state.
 */
export async function e2eMemberSessionsPurge(runId: string): Promise<string[]> {
  const { stdout } = await execFileAsync("bun", ["scripts/e2eOrganizationMemberSessionsPurge.ts", runId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { deletedUserIds: string[] }
  return parsed.deletedUserIds
}
