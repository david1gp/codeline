import { describe, expect, test } from "bun:test"
import { sessionSidebarNewProjectResolve } from "./sessionSidebarNewProjectResolve.js"
import type { SessionSidebarProjectGroup } from "./sessionSidebarDerive.js"

describe("new sidebar project actions", () => {
  const registered: SessionSidebarProjectGroup = {
    projectId: "project-1",
    projectPath: "/work",
    projectLabel: "Registered",
    folderId: "folder-1",
    sessions: [],
  }
  const pathOnly: SessionSidebarProjectGroup = {
    projectPath: "/work",
    projectLabel: "Unregistered",
    sessions: [],
  }

  test("resolves registered groups by ID even when paths change", () => {
    expect(sessionSidebarNewProjectResolve({ projectId: "project-1", projectPath: "/old" }, [registered])).toEqual({
      project: registered,
      canDeleteByPath: false,
    })
  })

  test("does not borrow management actions from a registered project at the same path", () => {
    expect(sessionSidebarNewProjectResolve({ projectId: null, projectPath: "/work" }, [registered])).toBeNull()
    expect(sessionSidebarNewProjectResolve({ projectId: null, projectPath: "/work" }, [registered, pathOnly])).toEqual({
      project: pathOnly,
      canDeleteByPath: false,
    })
  })

  test("allows path deletion only when no other project shares the path", () => {
    expect(sessionSidebarNewProjectResolve({ projectId: null, projectPath: "/work" }, [pathOnly])).toEqual({
      project: pathOnly,
      canDeleteByPath: true,
    })
  })
})
