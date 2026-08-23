import { expect, test } from "bun:test"
import { runActiveRegistryCreate } from "../src/run/actions/runActiveRegistryCreate.js"

const scope = {
  sessionId: "session-1",
  userId: "user-1",
}

test("registers one execution per run and exposes its lifecycle", () => {
  const registry = runActiveRegistryCreate()
  const registered = registry.register({ ...scope, runId: "run-1" })

  expect(registered.success).toBe(true)
  if (!registered.success) return

  expect(registered.data.lifecycle).toMatchObject({ ...scope, runId: "run-1", status: "active" })
  expect(registry.lookup("run-1")).toBe(registered.data.lifecycle)
  expect(registered.data.lifecycle.signal.aborted).toBe(false)
  expect(registry.register({ ...scope, runId: "run-1" }).success).toBe(false)
})

test("cancels only the authorized active run and records its cancelled lifecycle", () => {
  const registry = runActiveRegistryCreate()
  const target = registry.register({ ...scope, runId: "target" })
  const sibling = registry.register({ ...scope, runId: "sibling" })
  const otherUser = registry.register({ ...scope, runId: "other", userId: "other-user" })

  if (!target.success || !sibling.success || !otherUser.success) return
  expect(registry.cancel({ ...scope, runIds: ["target", "target", "other"] })).toEqual(["target"])
  expect(target.data.lifecycle.signal.aborted).toBe(true)
  expect(registry.lookup("target")?.status).toBe("cancelled")
  expect(sibling.data.lifecycle.signal.aborted).toBe(false)
  expect(otherUser.data.lifecycle.signal.aborted).toBe(false)
})

test("honors cancellation before registration and cleans up the lifecycle", () => {
  const registry = runActiveRegistryCreate()
  expect(registry.cancel({ ...scope, runIds: ["late"] })).toEqual([])

  const registered = registry.register({ ...scope, runId: "late" })
  expect(registered.success).toBe(true)
  if (!registered.success) return

  expect(registered.data.lifecycle.status).toBe("cancelled")
  expect(registered.data.lifecycle.signal.aborted).toBe(true)
  registered.data.cleanup()
  registered.data.cleanup()
  expect(registry.lookup("late")).toBeUndefined()
})

test("consumes a pre-registration cancellation when the run is registered", () => {
  const registry = runActiveRegistryCreate()
  expect(registry.cancel({ ...scope, runIds: ["reused"] })).toEqual([])

  const first = registry.register({ ...scope, runId: "reused" })
  expect(first.success).toBe(true)
  if (!first.success) return
  expect(first.data.lifecycle.status).toBe("cancelled")
  first.data.cleanup()

  const second = registry.register({ ...scope, runId: "reused" })
  expect(second.success).toBe(true)
  if (!second.success) return
  expect(second.data.lifecycle.status).toBe("active")
  second.data.cleanup()
})
