import { expect, test } from "bun:test"
import { projectRegistryFolderCreateRequest } from "../src/project/client/projectRegistryFolderCreateRequest.js"
import { projectRegistryFolderListFetch } from "../src/project/client/projectRegistryFolderListFetch.js"
import { projectRegistryFolderRemoveRequest } from "../src/project/client/projectRegistryFolderRemoveRequest.js"
import { projectRegistryFolderRenameRequest } from "../src/project/client/projectRegistryFolderRenameRequest.js"
import { projectRegistryListFetch } from "../src/project/client/projectRegistryListFetch.js"
import { projectRegistryMoveRequest } from "../src/project/client/projectRegistryMoveRequest.js"

const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa0"
const folderId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa1"
const project = {
  active: false,
  available: true,
  faviconUrl: null,
  folderId,
  id: projectId,
  label: "Codeline",
  parentFolder: { id: folderId, label: "Workspace" },
  unseenEnded: false,
}
const folder = { active: false, id: folderId, label: "Workspace", unseenEnded: false }

test("project registry clients use folder CRUD and move endpoints", async () => {
  const requests: Array<{ body?: string; method?: string; url: string }> = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    requests.push({ body: init?.body === undefined ? undefined : String(init.body), method, url })

    if (url === "/api/project/registry/folders" && method === "GET") return Response.json({ folders: [folder] })
    if (url === "/api/project/registry/folders" && method === "POST") return Response.json({ folder })
    if (url === `/api/project/registry/folders/${folderId}` && method === "PATCH")
      return Response.json({ folder: { ...folder, label: "Renamed" } })
    if (url === `/api/project/registry/folders/${folderId}` && method === "DELETE")
      return new Response(null, { status: 204 })
    if (url === `/api/project/registry/move/${projectId}` && method === "PATCH") return Response.json({ project })
    return Response.json({ folders: [folder], projects: [project], truncated: false })
  }

  const folders = await projectRegistryFolderListFetch({ fetch: fetcher })
  expect(folders.success).toBe(true)
  const created = await projectRegistryFolderCreateRequest({ name: "Workspace" }, { fetch: fetcher })
  expect(created.success).toBe(true)
  const renamed = await projectRegistryFolderRenameRequest(folderId, { name: "Renamed" }, { fetch: fetcher })
  expect(renamed.success).toBe(true)
  const removed = await projectRegistryFolderRemoveRequest(folderId, { fetch: fetcher })
  expect(removed.success).toBe(true)
  const moved = await projectRegistryMoveRequest(projectId, { folderId: null }, { fetch: fetcher })
  expect(moved.success).toBe(true)

  expect(requests).toEqual([
    { method: "GET", url: "/api/project/registry/folders" },
    { body: '{"name":"Workspace"}', method: "POST", url: "/api/project/registry/folders" },
    { body: '{"name":"Renamed"}', method: "PATCH", url: `/api/project/registry/folders/${folderId}` },
    { method: "DELETE", url: `/api/project/registry/folders/${folderId}` },
    { body: '{"folderId":null}', method: "PATCH", url: `/api/project/registry/move/${projectId}` },
  ])
})

test("projectRegistryListFetch accepts folders, folderId, and project status fields", async () => {
  const result = await projectRegistryListFetch({
    fetch: async () => Response.json({ folders: [folder], projects: [project], truncated: false }),
  })

  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data.folders).toEqual([folder])
    expect(result.data.projects[0]).toMatchObject({ active: false, folderId, unseenEnded: false })
  }
})
