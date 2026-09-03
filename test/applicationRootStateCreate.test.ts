import { afterEach, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"

let currentLocation = { hash: "", pathname: "/sessions/session-1", search: "" }
let storedAccount: string | null = null

mock.module("@solidjs/router", () => ({
  useLocation: () => currentLocation,
}))

const { applicationRootStateCreate } = await import("../src/ui/applicationRootStateCreate.js")

const previousNavigator = globalThis.navigator
const previousStorage = globalThis.localStorage

afterEach(() => {
  currentLocation = { hash: "", pathname: "/sessions/session-1", search: "" }
  storedAccount = null
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage })
})

function browserOnlineSet(online: boolean): void {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: online } })
}

function localStorageSet(account: string | null): void {
  storedAccount = account
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => storedAccount },
  })
}

test("an offline session-route bootstrap mounts the cached browsing decision", async () => {
  browserOnlineSet(false)
  localStorageSet("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationRootStateCreate({
      fetcher: async () => {
        throw new TypeError("Failed to fetch")
      },
    }),
  }))

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.status()).toBe("offline")
  expect(root.state.isSignedOutCachedBrowsing()).toBe(true)
  expect(root.state.userId()).toBeUndefined()
  root.dispose()
})

test("an online auth error does not become signed-out cached browsing", async () => {
  browserOnlineSet(true)
  localStorageSet("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationRootStateCreate({
      fetcher: async () => {
        throw new TypeError("Failed to fetch")
      },
    }),
  }))

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.status()).toBe("error")
  expect(root.state.isSignedOutCachedBrowsing()).toBe(false)
  root.dispose()
})

test("an offline bootstrap without a last-active account does not mount the cached shell", async () => {
  browserOnlineSet(false)
  localStorageSet(null)
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationRootStateCreate({
      fetcher: async () => {
        throw new TypeError("Failed to fetch")
      },
    }),
  }))

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.status()).toBe("offline")
  expect(root.state.isSignedOutCachedBrowsing()).toBe(false)
  root.dispose()
})
