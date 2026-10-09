import { describe, expect, test } from "bun:test"
import { runGracefulCancelRegistryCreate } from "../../../src/run/actions/runGracefulCancelRegistryCreate.js"

describe("runGracefulCancelRegistryCreate", () => {
  test("tracks requests per run scope", () => {
    const registry = runGracefulCancelRegistryCreate()
    const run = { runId: "run-1", sessionId: "session-1", userId: "user-1" }
    expect(registry.isRequested(run)).toBe(false)
    registry.request(run)
    expect(registry.isRequested(run)).toBe(true)
    // Other runs and sessions are unaffected.
    expect(registry.isRequested({ ...run, runId: "run-2" })).toBe(false)
    expect(registry.isRequested({ ...run, sessionId: "session-2" })).toBe(false)
    registry.clear(run)
    expect(registry.isRequested(run)).toBe(false)
  })

  test("clear is idempotent", () => {
    const registry = runGracefulCancelRegistryCreate()
    const run = { runId: "run-1", sessionId: "session-1", userId: "user-1" }
    registry.clear(run)
    expect(registry.isRequested(run)).toBe(false)
  })
})
