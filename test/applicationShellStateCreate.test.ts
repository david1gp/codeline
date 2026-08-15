import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { applicationShellStateCreate } from "../src/ui/applicationShellStateCreate.js"

test("application shell manages right-panel availability and open state", () => {
  const root = createRoot((dispose) => ({ dispose, state: applicationShellStateCreate() }))

  expect(root.state.rightPanelAvailable()).toBe(false)
  expect(root.state.rightPanelOpen()).toBe(false)

  root.state.rightPanelEnable()
  root.state.rightPanelToggle()
  expect(root.state.rightPanelAvailable()).toBe(true)
  expect(root.state.rightPanelOpen()).toBe(true)

  root.state.rightPanelDisable()
  expect(root.state.rightPanelAvailable()).toBe(false)
  expect(root.state.rightPanelOpen()).toBe(false)
  root.dispose()
})

test("application shell resizes panels with keyboard controls", () => {
  const root = createRoot((dispose) => ({ dispose, state: applicationShellStateCreate() }))
  let prevented = 0

  root.state.resizeKeyDown("right-panel", {
    key: "ArrowRight",
    preventDefault: () => prevented++,
    shiftKey: false,
  } as unknown as KeyboardEvent)
  expect(root.state.rightPanelWidth()).toBe(548)

  root.state.resizeKeyDown("right-panel", {
    key: "ArrowLeft",
    preventDefault: () => prevented++,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.rightPanelWidth()).toBe(580)
  expect(prevented).toBe(2)
  root.dispose()
})
