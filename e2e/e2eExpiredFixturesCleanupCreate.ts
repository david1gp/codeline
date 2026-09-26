import * as v from "valibot"
import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"

const expiredSchema = v.strictObject({ runIds: v.array(v.pipe(v.string(), v.regex(/^[0-9a-z]{6,40}$/))) })
const statusSchema = v.object({ exists: v.boolean() })

/** Discover runs on the server, not in local checkpoints; verify each removal through the API. */
export function e2eExpiredFixturesCleanupCreate(
  token: string,
  allowedOrigins: Record<E2eCheckpoint["target"], string>,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  if (token.length < 32) throw new Error("E2E_FIXTURE_API_TOKEN must be configured for cleanup")
  return async (target: E2eCheckpoint["target"], origin: string): Promise<void> => {
    if (origin !== allowedOrigins[target] || !origin.startsWith("https://") || new URL(origin).origin !== origin)
      throw new Error("Fixture cleanup target mismatch; refusing to transmit credentials")
    const headers = { Authorization: `Bearer ${token}` }
    const request = async (url: string, method = "GET") => {
      const response = await fetcher(url, { method, headers, redirect: "error", cache: "no-store" })
      if (!response.ok) throw new Error(`Fixture ${method} failed: ${response.status}`)
      return (await response.json()) as unknown
    }
    // A full page means another page may exist; every pass must make verified progress.
    for (let page = 0; page < 100; page++) {
      const { runIds } = v.parse(expiredSchema, await request(`${origin}/api/_e2e/fixtures/runs/expired`))
      if (runIds.length > 100 || new Set(runIds).size !== runIds.length)
        throw new Error("Invalid expired fixture run listing")
      if (runIds.length === 0) return
      const errors: Error[] = []
      for (const id of runIds) {
        const url = `${origin}/api/_e2e/fixtures/runs/${id}`
        try {
          const before = v.parse(statusSchema, await request(url))
          if (!before.exists) throw new Error("Listed fixture run is already absent")
          const deleted = v.parse(statusSchema, await request(url, "DELETE"))
          if (deleted.exists || v.parse(statusSchema, await request(url)).exists)
            throw new Error("Fixture still exists after deletion")
        } catch (error) {
          errors.push(
            new Error(`Fixture ${id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }),
          )
        }
      }
      if (errors.length > 0)
        throw new AggregateError(errors, `Expired E2E fixture cleanup failed for ${errors.length} run(s)`)
    }
    throw new Error("Expired fixture cleanup exceeded 100 pages")
  }
}
