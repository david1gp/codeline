import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { configurationEditorStateCreate } = await import(
  "../../../src/configuration/ui/configurationEditorStateCreate.js"
)

test("configuration editor flushes the latest draft before its owner is disposed", () => {
  const previousLocalStorage = globalThis.localStorage
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })

  try {
    const root = createRoot((dispose) => ({
      dispose,
      state: configurationEditorStateCreate("skills", "codeline-test-config-skills"),
    }))

    root.state.contentInput({ currentTarget: { value: "edited before navigation" } } as never)
    root.dispose()

    const stored = JSON.parse(values.get("codeline-test-config-skills") ?? "null")
    expect(stored[0].content).toBe("edited before navigation")
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage })
  }
})
