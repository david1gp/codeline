import * as v from "valibot"
import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"

const statusSchema = v.object({ exists: v.boolean() })

/** The fixture API verifies owned identities; other integrations are outside its current scope. */
export function e2eFixtureCleanupCreate(
  token: string,
  allowedOrigins: Record<E2eCheckpoint["target"], string>,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  if (token.length < 32) throw new Error("E2E_FIXTURE_API_TOKEN must be configured for cleanup")
  return async (checkpoint: E2eCheckpoint): Promise<void> => {
    if (checkpoint.origin !== allowedOrigins[checkpoint.target])
      throw new Error("Fixture cleanup target mismatch; refusing to transmit credentials")
    const ids = checkpoint.resourceIds.fixtureRunIds
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^e2e[0-9a-z]{3,37}$/.test(id)))
      throw new Error("Invalid registered E2E fixture IDs; refusing unverified cleanup")
    const headers = { Authorization: `Bearer ${token}` }
    const status = async (url: string) => {
      const response = await fetcher(url, { headers, redirect: "error", cache: "no-store" })
      if (!response.ok) throw new Error(`Fixture status failed: ${response.status}`)
      return v.parse(statusSchema, (await response.json()) as unknown)
    }
    const errors: Error[] = []
    for (const id of ids) {
      const url = `${checkpoint.origin}/api/_e2e/fixtures/runs/${id}`
      try {
        if ((await status(url)).exists) {
          const response = await fetcher(url, { method: "DELETE", headers, redirect: "error", cache: "no-store" })
          if (!response.ok) throw new Error(`Fixture cleanup failed: ${response.status}`)
          const deleted = v.parse(statusSchema, (await response.json()) as unknown)
          if (deleted.exists) throw new Error("Fixture cleanup did not confirm removal")
        }
        if ((await status(url)).exists) throw new Error("Fixture still exists after cleanup")
      } catch (error) {
        errors.push(
          new Error(`Fixture ${id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }),
        )
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `E2E fixture cleanup failed for ${errors.length} run(s)`)
  }
}
