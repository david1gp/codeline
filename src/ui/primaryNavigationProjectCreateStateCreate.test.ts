import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { primaryNavigationProjectCreateStateCreate } from "./primaryNavigationProjectCreateStateCreate.js"

test("new project action opens the app-level registration dialog without workspace actions", () => {
  const root = createRoot((dispose) => ({ dispose, state: primaryNavigationProjectCreateStateCreate() }))

  expect(root.state.dialogOpen()).toBe(false)
  root.state.open()
  expect(root.state.dialogOpen()).toBe(true)
  root.dispose()
})
