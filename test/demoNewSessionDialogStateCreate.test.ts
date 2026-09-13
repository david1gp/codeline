import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { demoNewSessionDialogStateCreate } from "../src/ui/demo/demoNewSessionDialogStateCreate.js"

test("new session dialog demo exposes deterministic projects and records an inert selected outcome", () => {
  createRoot((dispose) => {
    const state = demoNewSessionDialogStateCreate()

    expect(state.projects()).toEqual([
      expect.objectContaining({ id: "codeline", projectPath: "/home/demo/adaptive/codeline" }),
      expect.objectContaining({ id: "design-system", projectPath: "/home/demo/adaptive/solid-ui" }),
      expect.objectContaining({ available: false, id: "archived-tools" }),
    ])
    expect(state.selectedOutcome()).toBe("No project selected yet.")

    expect(state.projectRegistry.status()).toBe("ready")

    state.projectIdOverride.set("design-system")
    state.projectPathOverride.set("/home/demo/adaptive/solid-ui")
    state.sessionTarget.sessionNew?.()

    expect(state.selectedOutcome()).toBe("Adaptive Design System — /home/demo/adaptive/solid-ui")
    dispose()
  })
})

test("new session dialog demo resolves project suggestions and registration from fixtures", async () => {
  const state = demoNewSessionDialogStateCreate()
  const response = await state.projectFetch("/api/project/suggestions?path=demo", {})
  expect(response.ok).toBe(true)
  expect(await response.json()).toEqual({
    suggestions: [{ label: "Demo workspace", path: "/home/demo/adaptive/demo-workspace" }],
  })
  const registration = await state.projectFetch("/api/project/registry", { method: "POST" })
  expect(registration.ok).toBe(true)
  expect(await registration.json()).toEqual({
    project: {
      available: true,
      faviconUrl: null,
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f70",
      label: "Demo workspace",
      parentFolder: null,
    },
  })
})
