import { expect, test } from "bun:test"
import { sessionSidebarNewGroupsDerive } from "./sessionSidebarNewGroupsDerive.js"

test("sidebar groups sessions by registered project identity and falls back to path identity", () => {
  const groups = sessionSidebarNewGroupsDerive([
    { id: "one", projectId: "stable-project-id", projectPath: "/work/old-path" },
    { id: "two", projectId: "stable-project-id", projectPath: "/work/current-path" },
    { id: "three", projectId: "another-project-id", projectPath: "/work/old-path" },
    { id: "four", projectPath: "/work/unregistered" },
    { id: "five", projectPath: "/work/unregistered" },
  ])

  expect(groups.map(({ id, sessions }) => [id, sessions.map(({ id: sessionId }) => sessionId)])).toEqual([
    ["project:stable-project-id", ["one", "two"]],
    ["project:another-project-id", ["three"]],
    ["path:/work/unregistered", ["four", "five"]],
  ])
})
