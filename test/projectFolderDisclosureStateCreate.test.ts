import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { projectFolderDisclosureStateCreate } = await import("../src/project/ui/projectFolderDisclosureStateCreate.js")
const { projectFolderDisclosureRead } = await import("../src/project/ui/projectFolderDisclosureRead.js")
const { projectFolderDisclosureWrite } = await import("../src/project/ui/projectFolderDisclosureWrite.js")
const { projectFolderDisclosureStorageKeyCreate } = await import(
  "../src/project/ui/projectFolderDisclosureStorageKeyCreate.js"
)

function memoryStorageCreate(): Storage {
  const data = new Map<string, string>()
  return {
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

test("projectFolderDisclosureStorageKeyCreate formats per-account key", () => {
  expect(projectFolderDisclosureStorageKeyCreate("user-123")).toBe("codeline.project-folder-disclosure.user-123")
  expect(projectFolderDisclosureStorageKeyCreate(null)).toBe("codeline.project-folder-disclosure.default")
})

test("projectFolderDisclosureRead and projectFolderDisclosureWrite persist JSON in storage", async () => {
  const storage = memoryStorageCreate()
  expect(projectFolderDisclosureRead("acc-1", storage)).toEqual({})

  projectFolderDisclosureWrite("acc-1", "folder-1", false, storage)
  await tick()
  expect(projectFolderDisclosureRead("acc-1", storage)).toEqual({ "folder-1": false })

  projectFolderDisclosureWrite("acc-1", "folder-2", true, storage)
  await tick()
  expect(projectFolderDisclosureRead("acc-1", storage)).toEqual({ "folder-1": false, "folder-2": true })
})

test("projectFolderDisclosureStateCreate defaults to open when unconfigured", () => {
  const storage = memoryStorageCreate()
  const root = createRoot((dispose) => {
    const state = projectFolderDisclosureStateCreate({
      accountId: () => "acc-1",
      storage,
    })
    return { dispose, state }
  })

  expect(root.state.isFolderOpen("folder-1")).toBe(true)
  expect(root.state.isFolderOpen("folder-2")).toBe(true)
  root.dispose()
})

test("projectFolderDisclosureStateCreate toggles folder and writes preference", async () => {
  const storage = memoryStorageCreate()
  const root = createRoot((dispose) => {
    const state = projectFolderDisclosureStateCreate({
      accountId: () => "acc-2",
      storage,
    })
    return { dispose, state }
  })

  root.state.folderToggle("folder-1", false)
  await tick()
  expect(root.state.isFolderOpen("folder-1")).toBe(false)
  expect(root.state.preferences()).toEqual({ "folder-1": false })
  expect(projectFolderDisclosureRead("acc-2", storage)).toEqual({ "folder-1": false })

  root.state.folderToggle("folder-1", true)
  await tick()
  expect(root.state.isFolderOpen("folder-1")).toBe(true)
  expect(root.state.preferences()).toEqual({ "folder-1": true })
  root.dispose()
})

test("projectFolderDisclosureStateCreate forces open when descendant is selected without overwriting stored preference", async () => {
  const storage = memoryStorageCreate()
  storage.setItem(projectFolderDisclosureStorageKeyCreate("acc-3"), JSON.stringify({ "folder-collapsed": false }))

  const root = createRoot((dispose) => {
    const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
    const state = projectFolderDisclosureStateCreate({
      accountId: () => "acc-3",
      storage,
    })
    return { dispose, selectedSessionId, setSelectedSessionId, state }
  })

  // When descendant is not selected: returns stored closed state (false)
  expect(root.state.isFolderOpen("folder-collapsed", false)).toBe(false)

  // When descendant session is selected: isFolderOpen returns true (forced open)
  expect(root.state.isFolderOpen("folder-collapsed", true)).toBe(true)

  // Stored preference must NOT be overwritten
  expect(root.state.preferences()["folder-collapsed"]).toBe(false)
  expect(projectFolderDisclosureRead("acc-3", storage)["folder-collapsed"]).toBe(false)

  // When descendant is no longer selected: returns to false
  expect(root.state.isFolderOpen("folder-collapsed", false)).toBe(false)
  root.dispose()
})

test("projectFolderDisclosureStateCreate updates on accountId change", async () => {
  const storage = memoryStorageCreate()
  storage.setItem(projectFolderDisclosureStorageKeyCreate("user-a"), JSON.stringify({ "folder-1": false }))
  storage.setItem(projectFolderDisclosureStorageKeyCreate("user-b"), JSON.stringify({ "folder-1": true }))

  const root = createRoot((dispose) => {
    const [account, setAccount] = createSignal<string | null>("user-a")
    const state = projectFolderDisclosureStateCreate({
      accountId: account,
      storage,
    })
    return { dispose, setAccount, state }
  })

  expect(root.state.isFolderOpen("folder-1")).toBe(false)

  root.setAccount("user-b")
  await tick()
  expect(root.state.isFolderOpen("folder-1")).toBe(true)

  root.dispose()
})
