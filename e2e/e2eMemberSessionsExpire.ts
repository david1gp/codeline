import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as v from "valibot"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

export type E2eExpiredSession = {
  expiresAt: string
  sessionId: string
}

const execFileAsync = promisify(execFile)
const expiredSchema = v.object({
  exists: v.literal(true),
  expiredSessions: v.array(v.object({ expiresAt: v.string(), sessionId: v.string() })),
})

/**
 * Expires only the selected owned member through the fixture API. Explicit legacy
 * local mode retains the development-guarded script.
 */
export async function e2eMemberSessionsExpire(runId: string, userId: string): Promise<E2eExpiredSession[]> {
  const context = await e2eFixtureContextResolve()
  if (context !== undefined) {
    if (!context.checkpoint.resourceIds.fixtureRunIds.includes(runId)) throw new Error("Unregistered E2E fixture run")
    const expired = await e2eFixtureRequest(context.origin, context.token, `/${runId}/expire`, expiredSchema, "POST", {
      userId,
    })
    return expired.expiredSessions
  }
  const { stdout } = await execFileAsync("bun", ["scripts/e2eOrganizationMemberSessionsExpire.ts", runId, userId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { sessions: E2eExpiredSession[] }
  return parsed.sessions
}
