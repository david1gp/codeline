import { expect, test } from "bun:test"
import { sessionSidebarActionsStateCreate } from "../src/ui/sessionSidebarActionsStateCreate.js"
import { sessionSidebarSessionDelete } from "../src/ui/sessionSidebarSessionDelete.js"
import { sessionSidebarSessionRename } from "../src/ui/sessionSidebarSessionRename.js"

type RecordedRequest = { ifMatch: string | null; method: string; url: string }

function sessionDetailResponse(etag: string, title: string) {
  return Response.json({
    agent: { id: "agent-1" },
    etag,
    revision: 1,
    schemaVersion: "session.v1",
    server: { id: "server-1" },
    session: {
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      id: "session-1",
      metadata: {},
      parentSessionId: null,
      pinned: false,
      primaryAgentId: "agent-1",
      projectPath: "~",
      revision: 1,
      serverId: "server-1",
      title,
      updatedAt: "2026-08-23T00:00:00.000Z",
    },
  })
}

function fetcherCreate(requests: RecordedRequest[], mutate: () => Response) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    requests.push({ ifMatch: new Headers(init?.headers).get("If-Match"), method, url: String(input) })
    if (method === "GET") return sessionDetailResponse('"session-etag"', "Original")
    return mutate()
  }
}

test("sidebar rename reads the current ETag and sends a conditional PATCH", async () => {
  const requests: RecordedRequest[] = []
  const result = await sessionSidebarSessionRename(
    "session-1",
    "  Renamed  ",
    fetcherCreate(requests, () => sessionDetailResponse('"session-etag-2"', "Renamed")),
  )

  expect(result).toEqual({ success: true, data: "Renamed" })
  expect(requests).toEqual([
    { ifMatch: null, method: "GET", url: "/api/sessions/session-1" },
    { ifMatch: '"session-etag"', method: "PATCH", url: "/api/sessions/session-1" },
  ])
})

test("sidebar rename validates the title before issuing any request", async () => {
  const requests: RecordedRequest[] = []
  const empty = await sessionSidebarSessionRename(
    "session-1",
    "   ",
    fetcherCreate(requests, () => sessionDetailResponse('"session-etag-2"', "x")),
  )
  const long = await sessionSidebarSessionRename(
    "session-1",
    "x".repeat(501),
    fetcherCreate(requests, () => sessionDetailResponse('"session-etag-2"', "x")),
  )

  expect(empty.success).toBe(false)
  expect(empty.success ? "" : empty.errorMessage).toBe("Enter a session title.")
  expect(long.success ? "" : long.errorMessage).toBe("Session titles can be at most 500 characters.")
  expect(requests).toEqual([])
})

test("sidebar rename surfaces the API error message on a precondition failure", async () => {
  const requests: RecordedRequest[] = []
  const result = await sessionSidebarSessionRename(
    "session-1",
    "Renamed",
    fetcherCreate(requests, () =>
      Response.json(
        {
          error: {
            code: "precondition_failed",
            message: "The session changed before it could be renamed.",
            op: "sessionRename",
            retryable: false,
            status: 412,
          },
        },
        { status: 412 },
      ),
    ),
  )

  expect(result.success).toBe(false)
  expect(result.success ? "" : result.errorMessage).toBe("The session changed before it could be renamed.")
})

test("sidebar delete reads the current ETag and sends a conditional DELETE", async () => {
  const requests: RecordedRequest[] = []
  const result = await sessionSidebarSessionDelete(
    "session-1",
    fetcherCreate(requests, () => Response.json({ deleted: true, session: { id: "session-1", revision: 2 } })),
  )

  expect(result).toEqual({ success: true, data: true })
  expect(requests).toEqual([
    { ifMatch: null, method: "GET", url: "/api/sessions/session-1" },
    { ifMatch: '"session-etag"', method: "DELETE", url: "/api/sessions/session-1" },
  ])
})

test("sidebar delete reports connection failures as retryable", async () => {
  const result = await sessionSidebarSessionDelete("session-1", async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") return sessionDetailResponse('"session-etag"', "Original")
    throw new Error("offline")
  })

  expect(result.success).toBe(false)
  expect(result.success ? "" : result.errorMessage).toBe(
    "The session could not be deleted. Check your connection and try again.",
  )
})

test("sidebar actions project rename sends PATCH to registry when projectId is present", async () => {
  const requests: RecordedRequest[] = []
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f50"
  let refreshed = false

  const actions = sessionSidebarActionsStateCreate({
    fetcher: fetcherCreate(requests, () =>
      Response.json({
        project: { available: true, faviconUrl: null, id: projectId, label: "Renamed Project" },
      }),
    ),
    onProjectRenamed: () => {
      refreshed = true
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.projectRenameOpen({ projectId, projectLabel: "Initial Label", projectPath: "/workspace/project" })
  actions.draftChange("Renamed Project")
  await actions.projectRenameSubmit()

  expect(requests).toEqual([
    {
      ifMatch: null,
      method: "PATCH",
      url: `/api/project/registry/${projectId}`,
    },
  ])
  expect(refreshed).toBe(true)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions project remove sends DELETE to registry without deleting sessions", async () => {
  const requests: RecordedRequest[] = []
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f51"
  let removedProjectId: string | undefined

  const actions = sessionSidebarActionsStateCreate({
    fetcher: async (input, init) => {
      const method = init?.method ?? "GET"
      requests.push({ ifMatch: null, method, url: String(input) })
      return new Response(null, { status: 204 })
    },
    onProjectRemoved: (id) => {
      removedProjectId = id
    },
    sessionIdsForProject: () => ["session-1", "session-2"],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => ["Session 1", "Session 2"],
  })

  actions.projectRemoveOpen({ projectId, projectLabel: "To Remove", projectPath: "/workspace/project" })
  expect(actions.dialog().kind).toBe("projectRemove")

  await actions.projectRemoveSubmit()

  expect(requests).toEqual([
    {
      ifMatch: null,
      method: "DELETE",
      url: `/api/project/registry/${projectId}`,
    },
  ])
  expect(removedProjectId).toBe(projectId)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions project delete for unregistered historical project deletes each session", async () => {
  const deletedSessionIds: string[] = []
  const notifiedDeletedIds: string[] = []

  const actions = sessionSidebarActionsStateCreate({
    onSessionDeleted: (sessionId) => {
      notifiedDeletedIds.push(sessionId)
    },
    sessionDelete: async (sessionId) => {
      deletedSessionIds.push(sessionId)
      return { data: true, success: true }
    },
    sessionIdsForProject: (projectPath) => (projectPath === "/workspace/historical" ? ["session-a", "session-b"] : []),
    sessionTitle: () => undefined,
    sessionTitlesForProject: (projectPath) =>
      projectPath === "/workspace/historical" ? ["Session A", "Session B"] : [],
  })

  actions.projectDeleteOpen({ projectLabel: "historical", projectPath: "/workspace/historical" })
  expect(actions.dialog()).toEqual({ kind: "projectDelete", projectPath: "/workspace/historical" })

  await actions.projectDeleteSubmit()

  expect(deletedSessionIds).toEqual(["session-a", "session-b"])
  expect(notifiedDeletedIds).toEqual(["session-a", "session-b"])
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions project remove is a no-op if projectId is undefined", async () => {
  let removeCalled = false
  const actions = sessionSidebarActionsStateCreate({
    projectRemove: async () => {
      removeCalled = true
      return { data: undefined, success: true }
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.projectRemoveOpen({ projectLabel: "historical", projectPath: "/workspace/historical" })
  expect(actions.dialog().kind).toBe("projectRemove")

  await actions.projectRemoveSubmit()

  expect(removeCalled).toBe(false)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions folder create posts new folder", async () => {
  const requests: RecordedRequest[] = []
  let created = false

  const actions = sessionSidebarActionsStateCreate({
    fetcher: async (input, init) => {
      requests.push({ ifMatch: null, method: init?.method ?? "GET", url: String(input) })
      return Response.json({
        folder: { active: false, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fe0", label: "My Folder", unseenEnded: false },
      })
    },
    onFolderCreated: () => {
      created = true
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.folderCreateOpen()
  expect(actions.dialog().kind).toBe("folderCreate")

  actions.draftChange("My Folder")
  await actions.folderCreateSubmit()

  expect(requests).toEqual([{ ifMatch: null, method: "POST", url: "/api/project/registry/folders" }])
  expect(created).toBe(true)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions folder rename patches folder name", async () => {
  const requests: RecordedRequest[] = []
  let renamed = false
  const folderId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fe1"

  const actions = sessionSidebarActionsStateCreate({
    fetcher: async (input, init) => {
      requests.push({ ifMatch: null, method: init?.method ?? "GET", url: String(input) })
      return Response.json({
        folder: { active: false, id: folderId, label: "Renamed Folder", unseenEnded: false },
      })
    },
    onFolderRenamed: () => {
      renamed = true
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.folderRenameOpen({ id: folderId, label: "Original Folder" })
  expect(actions.dialog().kind).toBe("folderRename")
  expect(actions.draft()).toBe("Original Folder")

  actions.draftChange("Renamed Folder")
  await actions.folderRenameSubmit()

  expect(requests).toEqual([{ ifMatch: null, method: "PATCH", url: `/api/project/registry/folders/${folderId}` }])
  expect(renamed).toBe(true)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions folder delete removes folder", async () => {
  const requests: RecordedRequest[] = []
  let removed = false
  const folderId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fe2"

  const actions = sessionSidebarActionsStateCreate({
    fetcher: async (input, init) => {
      requests.push({ ifMatch: null, method: init?.method ?? "GET", url: String(input) })
      return new Response(null, { status: 204 })
    },
    onFolderRemoved: () => {
      removed = true
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.folderDeleteOpen({ id: folderId, label: "To Delete" })
  expect(actions.dialog().kind).toBe("folderDelete")

  await actions.folderDeleteSubmit()

  expect(requests).toEqual([{ ifMatch: null, method: "DELETE", url: `/api/project/registry/folders/${folderId}` }])
  expect(removed).toBe(true)
  expect(actions.dialog().kind).toBe("closed")
})

test("sidebar actions project move assigns or unassigns folder", async () => {
  const requests: RecordedRequest[] = []
  let moved = false
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fe3"
  const folderId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fe4"

  const actions = sessionSidebarActionsStateCreate({
    fetcher: async (input, init) => {
      requests.push({ ifMatch: null, method: init?.method ?? "GET", url: String(input) })
      return Response.json({
        project: { available: true, faviconUrl: null, folderId, id: projectId, label: "Project" },
      })
    },
    onProjectMoved: () => {
      moved = true
    },
    sessionIdsForProject: () => [],
    sessionTitle: () => undefined,
    sessionTitlesForProject: () => [],
  })

  actions.projectMoveOpen({ folderId: null, id: projectId, label: "Project" })
  expect(actions.dialog().kind).toBe("projectMove")

  await actions.projectMoveSubmit(folderId)

  expect(requests).toEqual([{ ifMatch: null, method: "PATCH", url: `/api/project/registry/move/${projectId}` }])
  expect(moved).toBe(true)
  expect(actions.dialog().kind).toBe("closed")
})
