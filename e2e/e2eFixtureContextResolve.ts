import * as v from "valibot"
import { e2eCheckpointStoreCreate } from "./e2eCheckpointStoreCreate.js"

const runIdSchema = v.pipe(v.string(), v.regex(/^[0-9a-z]{6,40}$/))
const targetSchema = v.picklist(["production", "dev"])

/** An explicit opt-in is required to use the old local-only scripts. */
export async function e2eFixtureContextResolve() {
  const checkpointRunId = process.env.E2E_RUN_ID
  const target = process.env.E2E_TARGET
  const token = process.env.E2E_FIXTURE_API_TOKEN
  if (process.env.E2E_LEGACY_LOCAL === "1" && !checkpointRunId && !target && !token) return undefined
  const parsedRunId = v.safeParse(runIdSchema, checkpointRunId)
  const parsedTarget = v.safeParse(targetSchema, target)
  if (!parsedRunId.success || !parsedTarget.success || !token || token.length < 32)
    throw new Error("E2E_RUN_ID, E2E_TARGET and E2E_FIXTURE_API_TOKEN are required for API fixtures")
  const origin = process.env.PUBLIC_ORIGIN
  const expectedOrigin =
    parsedTarget.output === "production" ? "https://preview.codeline.work" : (process.env.E2E_DEV_ORIGIN ?? origin)
  if (
    !origin ||
    !expectedOrigin ||
    !expectedOrigin.startsWith("https://") ||
    new URL(expectedOrigin).origin !== expectedOrigin ||
    origin !== expectedOrigin
  )
    throw new Error("E2E fixture target origin mismatch; refusing to send credentials")
  const store = e2eCheckpointStoreCreate(
    process.env.NODE_ENV === "test" ? process.env.E2E_FIXTURE_CHECKPOINT_DIRECTORY : undefined,
  )
  const checkpoint = await store.load(parsedTarget.output)
  if (checkpoint?.runId !== parsedRunId.output || checkpoint.origin !== origin)
    throw new Error("E2E fixture checkpoint mismatch; refusing to send credentials")
  return { checkpoint, store, origin, token }
}
