import * as v from "valibot"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"

const diagnosticsSchema = v.strictObject({
  exists: v.boolean(),
  entries: v.array(v.record(v.string(), v.unknown())),
})

export async function e2eFixtureDiagnosticsRead(runId: string): Promise<Record<string, unknown>[]> {
  const context = await e2eFixtureContextResolve()
  if (context === undefined || !context.checkpoint.resourceIds.fixtureRunIds.includes(runId))
    throw new Error("Run-owned diagnostics require a registered API fixture run")
  const result = await e2eFixtureRequest(context.origin, context.token, `/${runId}/diagnostics`, diagnosticsSchema)
  if (!result.exists) throw new Error("The diagnostic fixture run is missing")
  return result.entries
}
