import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as v from "valibot"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

const execFileAsync = promisify(execFile)
const statusSchema = v.object({ exists: v.boolean(), userIds: v.optional(v.array(v.string())) })

/**
 * Legacy local mode purges immediately. In runner mode this is called from existing
 * spec teardown blocks but only verifies ownership; the runner, not a failed spec,
 * decides when to delete registered resources.
 */
export async function e2eMemberSessionsPurge(runId: string): Promise<string[]> {
  const context = await e2eFixtureContextResolve()
  if (context !== undefined) {
    // Compatibility with existing spec finally blocks: inspect ownership, but
    // NEVER delete on a spec failure. The suite runner owns successful teardown.
    if (!context.checkpoint.resourceIds.fixtureRunIds.includes(runId)) throw new Error("Unregistered E2E fixture run")
    const status = await e2eFixtureRequest(context.origin, context.token, `/${runId}`, statusSchema)
    if (!status.exists) throw new Error("E2E fixture run is missing; preserve checkpoint for investigation")
    if (status.userIds?.length !== 2) throw new Error("E2E fixture status lacks two verified members")
    return status.userIds
  }
  const { stdout } = await execFileAsync("bun", ["scripts/e2eOrganizationMemberSessionsPurge.ts", runId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { deletedUserIds: string[] }
  return parsed.deletedUserIds
}
