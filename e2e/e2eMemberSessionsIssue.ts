import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as v from "valibot"
import { oidcEnvironmentConfigurationResolve } from "../scripts/oidcEnvironmentConfigurationResolve.js"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
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
const issuedSchema = v.object({
  exists: v.literal(true),
  organizationId: v.string(),
  subjectPrefix: v.string(),
  members: v.tuple([
    v.object({ displayName: v.string(), expiresAt: v.string(), token: v.string(), userId: v.string() }),
    v.object({ displayName: v.string(), expiresAt: v.string(), token: v.string(), userId: v.string() }),
  ]),
})

/**
 * Registers a run-owned fixture before requesting its one-time tokens from the API.
 * Only explicit legacy local mode runs the old, development-guarded script.
 */
export async function e2eMemberSessionsIssue(runId: string): Promise<E2eIssuedMembers> {
  const context = await e2eFixtureContextResolve()
  if (context !== undefined) {
    if (!/^e2e[0-9a-z]{3,37}$/.test(runId) || runId === context.checkpoint.runId)
      throw new Error("A distinct E2E-marked test run ID is required")
    if (context.checkpoint.resourceIds.fixtureRunIds.includes(runId))
      throw new Error("E2E fixture run already registered; tokens are issued once, so resume must use a new test ID")
    // Save atomically BEFORE the request. A lost response leaves a discoverable
    // run (or a harmless absent marker), never an untracked server-side identity.
    await context.store.save({
      ...context.checkpoint,
      resourceIds: { fixtureRunIds: [...context.checkpoint.resourceIds.fixtureRunIds, runId] },
    })
    const issued = await e2eFixtureRequest(context.origin, context.token, "", issuedSchema, "POST", { runId })
    const oidc = oidcEnvironmentConfigurationResolve(process.env)
    if (!oidc.success) throw new Error(oidc.errorMessage)
    return {
      members: issued.members,
      organizationExternalId: oidc.data.organizationExternalId,
      organizationId: issued.organizationId,
      subjectPrefix: issued.subjectPrefix,
    }
  }
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
