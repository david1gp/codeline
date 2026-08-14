import { expect, test } from "bun:test"
import { projectFileTabStateCreate } from "../src/project/projectFileTabStateCreate.js"

test("opens and selects file tabs without changing their opening order", () => {
  const state = projectFileTabStateCreate()

  expect(state.tabOpen("src/index.ts").success).toBe(true)
  expect(state.tabOpen("README.md").success).toBe(true)
  expect(state.tabOpen("src/index.ts").success).toBe(true)

  expect(state.tabs().map((tab) => tab.path)).toEqual(["src/index.ts", "README.md"])
  expect(state.activePath()).toBe("src/index.ts")

  const selected = state.tabSelect("README.md")
  expect(selected.success).toBe(true)
  expect(state.tabs().map((tab) => tab.path)).toEqual(["src/index.ts", "README.md"])
  expect(state.activePath()).toBe("README.md")
})

test("closes tabs and deterministically falls back to the previous tab or first remaining tab", () => {
  const state = projectFileTabStateCreate()
  state.tabOpen("a.ts")
  state.tabOpen("b.ts")
  state.tabOpen("c.ts")

  expect(state.tabClose("b.ts").success).toBe(true)
  expect(state.tabs().map((tab) => tab.path)).toEqual(["a.ts", "c.ts"])
  expect(state.activePath()).toBe("c.ts")

  expect(state.tabClose("c.ts").success).toBe(true)
  expect(state.activePath()).toBe("a.ts")
  expect(state.tabClose("a.ts").success).toBe(true)
  expect(state.tabs()).toEqual([])
  expect(state.activePath()).toBeNull()

  state.tabOpen("first.ts")
  state.tabOpen("second.ts")
  state.tabSelect("first.ts")
  expect(state.tabClose("first.ts").success).toBe(true)
  expect(state.activePath()).toBe("second.ts")
})

test("returns Result errors and leaves state unchanged for invalid or unopened paths", () => {
  const state = projectFileTabStateCreate()
  state.tabOpen("src/index.ts")

  const invalid = state.tabOpen("../outside.ts")
  expect(invalid.success).toBe(false)
  const unopened = state.tabSelect("README.md")
  expect(unopened.success).toBe(false)
  const missingClose = state.tabClose("README.md")
  expect(missingClose.success).toBe(false)

  expect(state.tabs().map((tab) => tab.path)).toEqual(["src/index.ts"])
  expect(state.activePath()).toBe("src/index.ts")
})
