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

test("protects registration that arrives during reconciliation before its claim", () => {
  const registry = runActiveRegistryCreate()
  const reconciliation = registry.reconciliationBegin()

  const registered = registry.register({ ...scope, runId: "during-reconciliation" })
  expect(registered.success).toBe(true)
  if (!registered.success) return

  expect(reconciliation.claim(["during-reconciliation"])).toEqual([])
  expect(registry.lookup("during-reconciliation")).toBe(registered.data.lifecycle)

  reconciliation.release()
  registered.data.cleanup()
})

test("rejects a late registration without leaving ownership or consuming cancellation", () => {
  const registry = runActiveRegistryCreate()
  expect(registry.cancel({ ...scope, runIds: ["late-reconciliation"] })).toEqual([])
  const reconciliation = registry.reconciliationBegin()

  expect(reconciliation.claim(["late-reconciliation"])).toEqual(["late-reconciliation"])
  const failed = registry.register({ ...scope, runId: "late-reconciliation" })

  expect(failed.success).toBe(false)
  expect(registry.lookup("late-reconciliation")).toBeUndefined()

  reconciliation.release()
  const registered = registry.register({ ...scope, runId: "late-reconciliation" })
  expect(registered.success).toBe(true)
  if (!registered.success) return
  expect(registered.data.lifecycle.status).toBe("cancelled")
  expect(registered.data.lifecycle.signal.aborted).toBe(true)
  registered.data.cleanup()
})

test("rolls back a failed registration and preserves its pending cancellation", () => {
  const registry = runActiveRegistryCreate()
  expect(registry.cancel({ ...scope, runIds: ["failed-registration"] })).toEqual([])
  const controller = {
    abort: () => undefined,
    signal: {
      aborted: false,
      addEventListener: () => {
        throw new Error("listener registration failed")
      },
      removeEventListener: () => undefined,
    },
  } as never

  const failed = registry.register({ ...scope, controller, runId: "failed-registration" })
  expect(failed.success).toBe(false)
  expect(registry.lookup("failed-registration")).toBeUndefined()

  const registered = registry.register({ ...scope, runId: "failed-registration" })
  expect(registered.success).toBe(true)
  if (!registered.success) return
  expect(registered.data.lifecycle.status).toBe("cancelled")
  expect(registered.data.lifecycle.signal.aborted).toBe(true)
  registered.data.cleanup()
})

test("rejects duplicate ownership across scopes without replacing the first owner", () => {
  const registry = runActiveRegistryCreate()
  const first = registry.register({ ...scope, runId: "duplicate-owner" })
  expect(first.success).toBe(true)
  if (!first.success) return

  const duplicate = registry.register({ runId: "duplicate-owner", sessionId: "other-session", userId: "other-user" })
  expect(duplicate.success).toBe(false)
  expect(registry.lookup("duplicate-owner")).toBe(first.data.lifecycle)

  first.data.cleanup()
})
