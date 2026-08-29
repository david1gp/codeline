import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { projectRegistryStateCreate } = await import("../src/project/ui/projectRegistryStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("projectRegistryStateCreate loads registered projects with account scoping", async () => {
  const requests: Array<{ body?: string; headers?: Record<string, string>; url: string }> = []
  const projectsData = [
    { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa0", label: "Codeline" },
    { available: false, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa1", label: "Missing Directory" },
  ]

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-1",
      fetch: async (input) => {
        requests.push({ url: String(input) })
        return Response.json({ folders: [], projects: projectsData, truncated: false })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe("/api/project/registry")
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toHaveLength(2)
  expect(root.state.availableProjects()).toHaveLength(1)
  expect(root.state.availableProjects()[0]?.id).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa0")
  expect(root.state.projectFind("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa1")?.label).toBe("Missing Directory")
  root.dispose()
})

test("projectRegistryStateCreate handles empty state", async () => {
  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-2",
      fetch: async () => Response.json({ folders: [], projects: [], truncated: false }),
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.status()).toBe("empty")
  expect(root.state.isEmpty()).toBe(true)
  expect(root.state.projects()).toHaveLength(0)
  expect(root.state.availableProjects()).toHaveLength(0)
  root.dispose()
})

test("projectRegistryStateCreate handles error and retry", async () => {
  let callCount = 0
  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-3",
      fetch: async () => {
        callCount += 1
        if (callCount === 1) {
          return Response.json({ error: { code: "internal_server_error", message: "Database down" } }, { status: 500 })
        }
        return Response.json({
          folders: [],
          projects: [{ available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa2", label: "Retried Project" }],
          truncated: false,
        })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.status()).toBe("error")
  expect(root.state.isError()).toBe(true)
  expect(root.state.errorMessage()).toBe("Database down")

  root.state.retry()
  await tick()
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toHaveLength(1)
  expect(root.state.projects()[0]?.label).toBe("Retried Project")
  root.dispose()
})

test("projectRegistryStateCreate projectRegister posts to registry and refreshes query", async () => {
  const requests: Array<{ body?: string; method?: string; url: string }> = []
  let listCount = 0

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-4",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ body: init?.body === undefined ? undefined : String(init.body), method, url })

        if (url === "/api/project/registry" && method === "POST") {
          return Response.json({
            project: {
              available: true,
              id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa3",
              label: "New Registered",
            },
          })
        }

        listCount += 1
        if (listCount > 1) {
          return Response.json({
            folders: [],
            projects: [{ available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa3", label: "New Registered" }],
            truncated: false,
          })
        }
        return Response.json({ folders: [], projects: [], truncated: false })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.projects()).toHaveLength(0)

  const registerResult = await root.state.projectRegister({ path: "/workspace/new-reg" })
  expect(registerResult.success).toBe(true)
  if (registerResult.success) {
    expect(registerResult.data.project.id).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa3")
  }

  await tick()
  expect(root.state.projects()).toHaveLength(1)
  expect(root.state.projects()[0]?.id).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa3")
  root.dispose()
})

test("projectRegistryStateCreate projectRename patches registry and refreshes query", async () => {
  const requests: Array<{ body?: string; method?: string; url: string }> = []
  let listCount = 0
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa4"

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-5",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ body: init?.body === undefined ? undefined : String(init.body), method, url })

        if (url === `/api/project/registry/${projectId}` && method === "PATCH") {
          return Response.json({
            project: {
              available: true,
              id: projectId,
              label: "Renamed Title",
            },
          })
        }

        listCount += 1
        if (listCount > 1) {
          return Response.json({
            folders: [],
            projects: [{ available: true, id: projectId, label: "Renamed Title" }],
            truncated: false,
          })
        }
        return Response.json({
          folders: [],
          projects: [{ available: true, id: projectId, label: "Initial Title" }],
          truncated: false,
        })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.projects()[0]?.label).toBe("Initial Title")

  const renameResult = await root.state.projectRename(projectId, { displayName: "Renamed Title" })
  expect(renameResult.success).toBe(true)
  if (renameResult.success) {
    expect(renameResult.data.project.label).toBe("Renamed Title")
  }

  await tick()
  expect(root.state.projects()[0]?.label).toBe("Renamed Title")
  root.dispose()
})

test("projectRegistryStateCreate projectRemove deletes from registry and refreshes query", async () => {
  const requests: Array<{ method?: string; url: string }> = []
  let listCount = 0
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa5"

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-6",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ method, url })

        if (url === `/api/project/registry/${projectId}` && method === "DELETE") {
          return new Response(null, { status: 204 })
        }

        listCount += 1
        if (listCount > 1) {
          return Response.json({ folders: [], projects: [], truncated: false })
        }
        return Response.json({
          folders: [],
          projects: [{ available: true, id: projectId, label: "To Remove" }],
          truncated: false,
        })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.projects()).toHaveLength(1)

  const removeResult = await root.state.projectRemove(projectId)
  expect(removeResult.success).toBe(true)

  await tick()
  expect(root.state.projects()).toHaveLength(0)
  root.dispose()
})

test("projectRegistryStateCreate openCodeImport posts to import endpoint and refreshes query", async () => {
  const requests: Array<{ method?: string; url: string }> = []
  let listCount = 0

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-7",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ method, url })

        if (url === "/api/project/registry/import" && method === "POST") {
          return Response.json({ importedCount: 3 })
        }

        listCount += 1
        if (listCount > 1) {
          return Response.json({
            folders: [],
            projects: [
              { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb0", label: "Imported 1" },
              { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb1", label: "Imported 2" },
              { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb2", label: "Imported 3" },
            ],
            truncated: false,
          })
        }
        return Response.json({ folders: [], projects: [], truncated: false })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.projects()).toHaveLength(0)

  const importResult = await root.state.openCodeImport()
  expect(importResult.success).toBe(true)
  if (importResult.success) {
    expect(importResult.data.importedCount).toBe(3)
  }

  await tick()
  expect(root.state.projects()).toHaveLength(3)
  expect(requests).toContainEqual({ method: "POST", url: "/api/project/registry/import" })
  root.dispose()
})

test("projectRegistryStateCreate manages folders and project assignment", async () => {
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc0"
  const folderId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc1"
  const requests: Array<{ body?: string; method: string; url: string }> = []
  let folders: Array<{ active: boolean; id: string; label: string; unseenEnded: boolean }> = []
  let project = {
    active: false,
    available: true,
    folderId: null as string | null,
    id: projectId,
    label: "Project",
    parentFolder: null as { id: string; label: string } | null,
    unseenEnded: false,
  }

  const root = createRoot((dispose) => {
    const state = projectRegistryStateCreate({
      accountId: () => "user-8",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ body: init?.body === undefined ? undefined : String(init.body), method, url })

        if (url === "/api/project/registry/folders" && method === "POST") {
          folders = [{ active: false, id: folderId, label: "Workspace", unseenEnded: false }]
          return Response.json({ folder: folders[0] })
        }
        if (url === `/api/project/registry/folders/${folderId}` && method === "PATCH") {
          folders = [{ active: false, id: folderId, label: "Renamed", unseenEnded: false }]
          return Response.json({ folder: folders[0] })
        }
        if (url === `/api/project/registry/folders/${folderId}` && method === "DELETE") {
          folders = []
          project = { ...project, folderId: null, parentFolder: null }
          return new Response(null, { status: 204 })
        }
        if (url === `/api/project/registry/move/${projectId}` && method === "PATCH") {
          const moveInput = JSON.parse(String(init?.body)) as { folderId: string | null }
          project = {
            ...project,
            folderId: moveInput.folderId,
            parentFolder: moveInput.folderId === null ? null : { id: folderId, label: "Workspace" },
          }
          return Response.json({ project })
        }
        return Response.json({ folders, projects: [project], truncated: false })
      },
    })
    return { dispose, state }
  })

  await tick()
  expect(root.state.folders()).toHaveLength(0)

  const created = await root.state.folderCreate({ name: "Workspace" })
  expect(created.success).toBe(true)
  await tick()
  expect(root.state.folderFind(folderId)?.label).toBe("Workspace")

  const renamed = await root.state.folderRename(folderId, { name: "Renamed" })
  expect(renamed.success).toBe(true)
  await tick()
  expect(root.state.folders()[0]?.label).toBe("Renamed")

  const moved = await root.state.projectMove(projectId, { folderId })
  expect(moved.success).toBe(true)
  await tick()
  expect(root.state.projectFind(projectId)?.folderId).toBe(folderId)

  const unassigned = await root.state.projectMove(projectId, { folderId: null })
  expect(unassigned.success).toBe(true)
  await tick()
  expect(root.state.projectFind(projectId)?.folderId).toBe(null)

  const removed = await root.state.folderRemove(folderId)
  expect(removed.success).toBe(true)
  await tick()
  expect(root.state.folders()).toHaveLength(0)
  expect(requests.map(({ method, url }) => `${method} ${url}`)).toContain(
    `PATCH /api/project/registry/move/${projectId}`,
  )
  root.dispose()
})
