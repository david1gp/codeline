import { expect, test } from "bun:test"
import { runCancellationCoordinatorCreate } from "../src/run/actions/runCancellationCoordinatorCreate.js"

const scope = {
  sessionId: "session-1",
  userId: "user-1",
}

test("signals only registered target and descendant runs in the requested scope", () => {
  const coordinator = runCancellationCoordinatorCreate()
  const target = new AbortController()
  const descendant = new AbortController()
  const sibling = new AbortController()
  const otherUser = new AbortController()

  coordinator.register({ ...scope, controller: target, runId: "target" })
  coordinator.register({ ...scope, controller: descendant, runId: "descendant" })
  coordinator.register({ ...scope, controller: sibling, runId: "sibling" })
  coordinator.register({ ...scope, controller: otherUser, runId: "target", userId: "other-user" })

  const signalled = coordinator.abort({ ...scope, runIds: ["target", "descendant", "target"] })

  expect(signalled).toEqual(["target", "descendant"])
  expect(target.signal.aborted).toBe(true)
  expect(descendant.signal.aborted).toBe(true)
  expect(sibling.signal.aborted).toBe(false)
  expect(otherUser.signal.aborted).toBe(false)
})

test("registration cleanup is idempotent and removes inactive controllers", () => {
  const coordinator = runCancellationCoordinatorCreate()
  const controller = new AbortController()
  const unregister = coordinator.register({ ...scope, controller, runId: "run" })

  unregister()
  unregister()

  expect(coordinator.abort({ ...scope, runIds: ["run"] })).toEqual([])
  expect(controller.signal.aborted).toBe(false)
})

test("a committed cancellation aborts a controller registered after the cancellation", () => {
  const coordinator = runCancellationCoordinatorCreate()
  const controller = new AbortController()

  expect(coordinator.abort({ ...scope, runIds: ["inactive"] })).toEqual([])
  const unregister = coordinator.register({ ...scope, controller, runId: "inactive" })

  expect(controller.signal.aborted).toBe(true)
  unregister()
  expect(coordinator.abort({ ...scope, runIds: ["inactive"] })).toEqual([])
})
