import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { activeProjectStateCreate } from "../src/ui/activeProjectStateCreate.js"

test("active project defaults to home and accepts a confirmed project", () => {
  const root = createRoot((dispose) => ({ dispose, state: activeProjectStateCreate() }))

  expect(root.state.project()).toEqual({ id: null, label: "Home", path: "~" })
  root.state.projectActivate({ label: "Codeline", path: "/workspace/codeline" })
  expect(root.state.project()).toEqual({ label: "Codeline", path: "/workspace/codeline" })
  root.dispose()
})
