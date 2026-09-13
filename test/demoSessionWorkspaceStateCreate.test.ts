import { expect, test } from "bun:test"
import { demoSessionWorkspaceStateCreate } from "../src/ui/demo/demoSessionWorkspaceStateCreate.js"

test("demo session workspace closes and reopens its file panel locally", () => {
  const state = demoSessionWorkspaceStateCreate(() => ({
    browserVariant: "ready",
    filesVariant: "ready",
    sessionVariant: "ready",
  }))

  expect(state.rightPanelOpen()).toBe(true)

  state.rightPanelClose()
  expect(state.rightPanelOpen()).toBe(false)

  state.rightPanelShow()
  expect(state.rightPanelOpen()).toBe(true)
})
