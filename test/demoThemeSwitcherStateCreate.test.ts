import { expect, mock, test } from "bun:test"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    let current = value
    return { get: () => current, set: (next: T) => (current = next) }
  },
}))
mock.module("solid-js", () => ({ onCleanup: () => undefined, onMount: () => undefined }))
const { demoThemeSwitcherStateCreate } = await import("../src/ui/demo/demoThemeSwitcherStateCreate.js")

test("demo theme switcher applies its non-persistent theme to the browser root", () => {
  const dark = new Set<string>()
  const classList = {
    add: (name: string) => dark.add(name),
    remove: (name: string) => dark.delete(name),
    toggle: (name: string, force?: boolean) => {
      const enabled = force ?? !dark.has(name)
      if (enabled) dark.add(name)
      else dark.delete(name)
      return enabled
    },
    contains: (name: string) => dark.has(name),
  }
  const previousDocument = globalThis.document
  const previousLocalStorage = globalThis.localStorage
  const storageWrites: string[] = []
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { classList } },
  })
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { setItem: (_key: string, value: string) => storageWrites.push(value) },
  })

  try {
    const state = demoThemeSwitcherStateCreate()
    state.themeCycle()
    expect(state.currentTheme()).toBe("light")
    expect(classList.contains("dark")).toBe(false)

    state.themeCycle()
    expect(state.currentTheme()).toBe("dark")
    expect(classList.contains("dark")).toBe(true)
    expect(storageWrites).toEqual([])
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage })
  }
})
