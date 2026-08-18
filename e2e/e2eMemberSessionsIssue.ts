import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

export type E2eMemberSession = {
  displayName: string
  expiresAt: string
  token: string
  userId: string
}

export type E2eIssuedMembers = {
  members: readonly [E2eMemberSession, E2eMemberSession]
  organizationExternalId: string
  organizationId: string
  subjectPrefix: string
}

const execFileAsync = promisify(execFile)

/**
 * Runs the checked-in issuing script under Bun so the browser contexts receive opaque
 * application sessions for two run-unique organization members without an interactive
 * provider login. The script itself refuses any non-local target environment.
 */
export async function e2eMemberSessionsIssue(runId: string): Promise<E2eIssuedMembers> {
  const { stdout } = await execFileAsync("bun", ["scripts/e2eOrganizationMemberSessionsIssue.ts", runId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as {
    members: E2eMemberSession[]
    organizationExternalId: string
    organizationId: string
    subjectPrefix: string
  }
  const [first, second] = parsed.members
  if (first === undefined || second === undefined) {
    throw new Error("The end-to-end member session script did not return two members.")
  }
  return {
    members: [first, second],
    organizationExternalId: parsed.organizationExternalId,
    organizationId: parsed.organizationId,
    subjectPrefix: parsed.subjectPrefix,
  }
}
