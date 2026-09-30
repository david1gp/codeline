import { expect, test } from "bun:test"
import { createComponent, createRoot, type JSX } from "solid-js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import { sessionSidebarNewModeRead } from "./sessionSidebarNewModeRead.js"
import { sessionSidebarNewModeWrite } from "./sessionSidebarNewModeWrite.js"
import { sessionSidebarNewOrderApply } from "./sessionSidebarNewOrderApply.js"
import { sessionSidebarNewOrderRead } from "./sessionSidebarNewOrderRead.js"
import { sessionSidebarNewOrderStorageKey } from "./sessionSidebarNewOrderStorageKey.js"
import { sessionSidebarNewOrderWrite } from "./sessionSidebarNewOrderWrite.js"
import { sessionSidebarNewStateCreate } from "./sessionSidebarNewStateCreate.js"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

test("new sidebar preference defaults to flat and persists selected mode", () => {
  const storage = memoryStorage()

  expect(sessionSidebarNewModeRead(storage)).toBe("flat")
  sessionSidebarNewModeWrite("projects", storage)
  expect(sessionSidebarNewModeRead(storage)).toBe("projects")
})

test("a mode toggle survives remounting the sidebar state immediately", () => {
  const storage = memoryStorage()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })

  const list = (() => ({ sessions: () => [], isSelected: () => false })) as unknown as () => SessionListState
  try {
    createRoot((dispose) => {
      const state = sessionSidebarNewStateCreate(list)
      state.modeChange("projects")
      dispose()
    })

    createRoot((dispose) => {
      expect(sessionSidebarNewStateCreate(list).mode()).toBe("projects")
      dispose()
    })
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
    else Object.defineProperty(globalThis, "localStorage", previousStorage)
  }
})

test("sidebar order is validated and isolated by account", () => {
  const storage = memoryStorage()

  sessionSidebarNewOrderWrite("account:a", ["session-1", "session-2", "session-1"], storage)
  expect(sessionSidebarNewOrderRead("account:a", storage)).toEqual(["session-1", "session-2"])
  expect(sessionSidebarNewOrderRead("account:b", storage)).toEqual([])

  storage.setItem(sessionSidebarNewOrderStorageKey("account:a"), "{invalid json")
  expect(sessionSidebarNewOrderRead("account:a", storage)).toEqual([])
})

test("manual ordering survives sidebar remounts for the same account", () => {
  const storage = memoryStorage()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  const account = { userId: () => "account:ordered" }
  const list = (() => ({
    sessions: () => [{ id: "session-a" }, { id: "session-b" }, { id: "session-c" }],
    isSelected: () => false,
  })) as unknown as () => SessionListState
  const provideAccount = (children: () => void) =>
    createComponent(applicationAccountContext.Provider, {
      value: account,
      get children() {
        return children() as unknown as JSX.Element
      },
    })

  try {
    createRoot((dispose) => {
      provideAccount(() => {
        const state = sessionSidebarNewStateCreate(list)
        state.moveBy("session-c", -2)
        expect(state.sessions().map(({ id }) => id)).toEqual(["session-c", "session-a", "session-b"])
      })
      dispose()
    })
    expect(sessionSidebarNewOrderRead("account:ordered", storage)).toEqual(["session-c", "session-a", "session-b"])

    const remountedSessions = sessionSidebarNewOrderApply(
      list().sessions(),
      sessionSidebarNewOrderRead("account:ordered"),
    )
    expect(remountedSessions.map(({ id }) => id)).toEqual(["session-c", "session-a", "session-b"])
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
    else Object.defineProperty(globalThis, "localStorage", previousStorage)
  }
})

test("FormKit proposed order updates visible sessions without losing paginated saved IDs", async () => {
  const storage = memoryStorage()
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  const account = { userId: () => "account:paginated" }
  sessionSidebarNewOrderWrite("account:paginated", ["session-a", "session-b", "session-hidden"], storage)
  const list = (() => ({
    sessions: () => [{ id: "session-a" }, { id: "session-b" }, { id: "session-c" }],
    isSelected: () => false,
  })) as unknown as () => SessionListState
  const provideAccount = (children: () => void) =>
    createComponent(applicationAccountContext.Provider, {
      value: account,
      get children() {
        return children() as unknown as JSX.Element
      },
    })

  try {
    let reorder: (() => void) | undefined
    let disposeRoot: (() => void) | undefined
    createRoot((dispose) => {
      disposeRoot = dispose
      provideAccount(() => {
        const state = sessionSidebarNewStateCreate(list)
        reorder = () => {
          state.moveToOrder(["session-b", "session-c", "session-a"])
          expect(state.sessions().map(({ id }) => id)).toEqual(["session-b", "session-c", "session-a"])
        }
      })
    })
    await Promise.resolve()
    reorder?.()
    disposeRoot?.()
    expect(sessionSidebarNewOrderRead("account:paginated", storage)).toEqual([
      "session-b",
      "session-c",
      "session-a",
      "session-hidden",
    ])
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
    else Object.defineProperty(globalThis, "localStorage", previousStorage)
  }
})
