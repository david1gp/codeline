import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { filesPageStateCreate } = await import("../src/ui/filesPageStateCreate.js")
const { filesScreenViewCreate } = await import("../src/ui/filesScreenViewCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const firstProject = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa0",
  label: "alpha",
  parentFolder: null,
}
const secondProject = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa1",
  label: "beta",
  parentFolder: { id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb0", label: "Workspace" },
}
const thirdProject = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa3",
  label: "aardvark",
  parentFolder: { id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb0", label: "Workspace" },
}
const unavailableProject = {
  available: false,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa2",
  label: "gamma",
  parentFolder: null,
}
const firstFilesProject = { id: firstProject.id, label: firstProject.label, parentFolder: firstProject.parentFolder }
const secondFilesProject = {
  id: secondProject.id,
  label: secondProject.label,
  parentFolder: secondProject.parentFolder,
}
const thirdFilesProject = { id: thirdProject.id, label: thirdProject.label, parentFolder: thirdProject.parentFolder }

test("Files page loads registered projects and accepts only an available selection", async () => {
  const calls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      accountId: () => "user-1",
      fetcher: async (input) => {
        calls.push(String(input))
        return Response.json({
          folders: [],
          projects: [firstProject, secondProject, thirdProject, unavailableProject],
          truncated: false,
        })
      },
    }),
  }))

  await tick()
  expect(calls).toEqual(["/api/project/registry"])
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toEqual([firstFilesProject, thirdFilesProject, secondFilesProject])
  expect(root.state.selectedProject()).toEqual(firstFilesProject)

  expect(root.state.projectSelectorOptions()).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: firstProject.id },
    { label: "Workspace", type: "group" },
    { type: "item", value: thirdProject.id },
    { type: "item", value: secondProject.id },
  ])

  root.state.projectSelect(secondProject.id)
  expect(root.state.selectedProject()).toEqual(secondFilesProject)
  root.state.projectSelect(unavailableProject.id)
  expect(root.state.selectedProject()).toEqual(secondFilesProject)
  root.state.projectSelect("unlisted")
  expect(root.state.selectedProject()).toEqual(secondFilesProject)
  root.dispose()
})

test("Files page exposes empty, error, and retry states", async () => {
  let attempts = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      accountId: () => "user-1",
      fetcher: async () => {
        attempts += 1
        if (attempts === 1) return new Response(null, { status: 500 })
        return Response.json({ folders: [], projects: [], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("error")
  expect(root.state.selectedProject()).toBeNull()
  root.state.retry()
  await tick()
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toEqual([])
  expect(root.state.selectedProject()).toBeNull()
  root.dispose()
})

test("Files page handles unavailable registered projects as empty available state", async () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      accountId: () => "user-1",
      fetcher: async () => Response.json({ folders: [], projects: [unavailableProject], truncated: false }),
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toEqual([])
  expect(root.state.selectedProject()).toBeNull()
  root.dispose()
})

test("Files page does not expose an empty project list as a root", async () => {
  const calls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: filesScreenViewCreate({
      accountId: () => "user-1",
      fetcher: async (input) => {
        calls.push(String(input))
        return Response.json({ folders: [], projects: [], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.browser()).toBeNull()
  expect(calls).toEqual(["/api/project/registry"])
  expect(root.state.status()).toBe("ready")
  root.dispose()
})

test("Files page restores and updates a validated selected project", async () => {
  const values = new Map<string, string>([["codeline.explorer.selectedProjectId", secondProject.id]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const fetcher = async () => Response.json({ folders: [], projects: [firstProject, secondProject], truncated: false })
  const firstRoot = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({ accountId: () => "user-1", fetcher, storage }),
  }))

  await tick()
  expect(firstRoot.state.selectedProject()).toEqual(secondFilesProject)
  firstRoot.state.projectSelect(firstProject.id)
  expect(values.get("codeline.explorer.selectedProjectId")).toBe(firstProject.id)
  firstRoot.dispose()

  const reloadedRoot = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({ accountId: () => "user-1", fetcher, storage }),
  }))
  await tick()
  expect(reloadedRoot.state.selectedProject()).toEqual(firstFilesProject)
  reloadedRoot.dispose()
})

test("Files screen scopes its browser to the selected project", async () => {
  const calls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: filesScreenViewCreate({
      accountId: () => "user-1",
      fetcher: async (input) => {
        const url = String(input)
        calls.push(url)
        if (url === "/api/project/registry")
          return Response.json({ folders: [], projects: [firstProject, secondProject], truncated: false })
        return Response.json({ entries: [] })
      },
    }),
  }))

  await tick()
  expect(calls).toContain(`/api/project/directory?project=${firstProject.id}&path=`)

  root.state.projectSelect(secondProject.id)
  await tick()

  expect(calls).toContain(`/api/project/directory?project=${secondProject.id}&path=`)
  expect(calls).not.toContain("/api/project/directory?path=")
  root.dispose()
})
