import * as v from "valibot"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

const commandProjectSchema = v.object({ exists: v.literal(true), path: v.pipe(v.string(), v.minLength(1)) })

/** Issue only for a checkpoint-registered member run; the response is the server's canonical path. */
export async function e2eCommandProjectIssue(runId: string): Promise<string> {
  const context = await e2eFixtureContextResolve()
  if (context === undefined) return e2eRepositoryRoot // Explicit legacy local mode only.
  if (!/^e2e[0-9a-z]{3,37}$/.test(runId) || !context.checkpoint.resourceIds.fixtureRunIds.includes(runId))
    throw new Error("Unregistered E2E command project fixture run")
  const project = await e2eFixtureRequest(
    context.origin,
    context.token,
    `/${runId}/command-project`,
    commandProjectSchema,
    "POST",
  )
  return project.path
}
