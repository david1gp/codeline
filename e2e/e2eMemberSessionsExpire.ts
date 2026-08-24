import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

export type E2eExpiredSession = {
  expiresAt: string
  sessionId: string
}

const execFileAsync = promisify(execFile)

/**
 * Runs the checked-in expiry script under Bun so a run can age out one synthetic
 * member's authenticated identity through the application expiry action. The
 * script refuses any user outside the run's subject namespace and any non-local
 * target environment.
 */
export async function e2eMemberSessionsExpire(runId: string, userId: string): Promise<E2eExpiredSession[]> {
  const { stdout } = await execFileAsync("bun", ["scripts/e2eOrganizationMemberSessionsExpire.ts", runId, userId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { sessions: E2eExpiredSession[] }
  return parsed.sessions
}
