import { expect, test } from "bun:test"
import { sessionSidebarNewActiveGroupResolve } from "./sessionSidebarNewActiveGroupResolve.js"

test("active session project group is identified for initial expansion", () => {
  const groups = [
    { id: "project:a", label: "A", projectId: "a", projectPath: "/a", sessions: [{ id: "one" }] },
    { id: "project:b", label: "B", projectId: "b", projectPath: "/b", sessions: [{ id: "two" }] },
  ]
  expect(sessionSidebarNewActiveGroupResolve(groups, "two")).toBe("project:b")
  expect(sessionSidebarNewActiveGroupResolve(groups, null)).toBeNull()
})
