import { expect, mock, test } from "bun:test"
import { sessionDisplayModeStorageKey } from "../src/ui/sessionDisplayModeStorageKey.js"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    let current = value
    return { get: () => current, set: (next: T) => (current = next) }
  },
}))

const { sessionDisplayModeStateCreate } = await import("../src/ui/sessionDisplayModeStateCreate.js")

test("session display mode defaults to conversation and ignores invalid storage", () => {
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
    expect(sessionDisplayModeStateCreate().mode()).toBe("conversation")

    values.set(sessionDisplayModeStorageKey, "invalid")
    expect(sessionDisplayModeStateCreate().mode()).toBe("conversation")
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage })
  }
})

test("session display mode persists the global selection and tolerates unavailable storage", () => {
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
    const state = sessionDisplayModeStateCreate()
    state.modeSelect("stream")
    expect(state.mode()).toBe("stream")
    expect(sessionDisplayModeStateCreate().mode()).toBe("stream")

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage unavailable")
        },
        setItem: () => {
          throw new Error("storage unavailable")
        },
      },
    })
    expect(sessionDisplayModeStateCreate().mode()).toBe("conversation")
    const unavailableState = sessionDisplayModeStateCreate()
    unavailableState.modeSelect("stream")
    expect(unavailableState.mode()).toBe("stream")
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage })
  }
})
