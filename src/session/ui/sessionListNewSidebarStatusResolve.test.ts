import { expect, test } from "bun:test"
import { sessionListNewSidebarStatusResolve } from "./sessionListNewSidebarStatusResolve.js"

test("new sidebar status follows the session list while the legacy tab is search", () => {
  const state = sessionListNewSidebarStatusResolve("loading", 0, true)

  expect(state.isLoading).toBe(true)
  expect(state.isError).toBe(false)
  expect(state.emptyMessage).toBe("No active conversations.")
})

test("new sidebar keeps loaded sessions visible during a list refresh", () => {
  const state = sessionListNewSidebarStatusResolve("loading", 2, true)

  expect(state.isLoading).toBe(false)
  expect(state.isError).toBe(false)
})
