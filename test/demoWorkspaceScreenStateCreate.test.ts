import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = solidRuntime.createSignal(value)
    return { get, set }
  },
}))

const { demoWorkspaceScreenStateCreate } = await import("../src/ui/demo/demoWorkspaceScreenStateCreate.js")

test("demo session selection is shared with the session target", () => {
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const eventTarget = { addEventListener: () => undefined, removeEventListener: () => undefined }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { ...eventTarget, activeElement: null, body: { style: { overflow: "" } } },
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ...eventTarget,
      matchMedia: () => ({ ...eventTarget, matches: false }),
    },
  })

  try {
    const state = demoWorkspaceScreenStateCreate(() => "ready")
    state.sessionList.selectSession("demo-session-catalog")

    expect(state.sessionTargetSelector.selectedSessionId()).toBe("demo-session-catalog")
    expect(state.selectedSession.session()?.id).toBe("demo-session-catalog")
    expect(state.selectedSession.hasSelection()).toBe(true)
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow })
  }
})
