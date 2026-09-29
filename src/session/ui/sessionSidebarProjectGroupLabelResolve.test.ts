import { expect, test } from "bun:test"
import { sessionSidebarProjectGroupLabelResolve } from "./sessionSidebarProjectGroupLabelResolve.js"

test("project label resolves by ID when project IDs are available", () => {
  const projects = [
    { projectId: "project-a", projectPath: "/work/shared", projectLabel: "Project A" },
    { projectId: "project-b", projectPath: "/work/shared", projectLabel: "Project B" },
  ]
  expect(
    sessionSidebarProjectGroupLabelResolve(
      { projectId: "project-b", projectPath: "/work/shared" },
      projects,
      "fallback",
    ),
  ).toBe("Project B")
})

test("path-only project labels resolve when the registered project ID is undefined", () => {
  expect(
    sessionSidebarProjectGroupLabelResolve(
      { projectId: null, projectPath: "/work/path-only" },
      [{ projectPath: "/work/path-only", projectLabel: "Path-only project" }],
      "fallback",
    ),
  ).toBe("Path-only project")
})
