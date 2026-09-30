import { expect, test } from "bun:test"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { commandMenuItemsCreate } from "./commandMenuItemsCreate.js"

const project: ProjectRegistryApiProject = {
  available: true,
  faviconUrl: null,
  id: "project-1",
  label: "Codeline",
  parentFolder: null,
}

const session: SessionShell = {
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "session-1",
  metadata: {},
  parentSessionId: null,
  pinned: false,
  primaryAgentId: "agent-1",
  projectPath: "/work/codeline",
  revision: 1,
  serverId: "server-1",
  title: "Fix command menu",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

test("command menu returns existing actions, destinations, and local registered projects", () => {
  const items = commandMenuItemsCreate({ projects: [project], query: "", sessions: [] })

  expect(items.map(({ id }) => id)).toContain("action:new-session")
  expect(items.map(({ id }) => id)).toContain("action:new-project")
  expect(items.map(({ id }) => id)).toContain("destination:explorer")
  expect(items.find(({ id }) => id === "project:project-1")).toMatchObject({
    kind: "project",
    projectId: "project-1",
  })
})

test("command menu filters local results and maps server session results to detail routes", () => {
  const items = commandMenuItemsCreate({ projects: [project], query: "fix command", sessions: [session] })

  expect(items).toEqual([
    expect.objectContaining({
      href: "/sessions/session-1",
      id: "session:session-1",
      kind: "session",
      label: "Fix command menu",
    }),
  ])
})

test("command menu keeps server-matched sessions even when their visible fields do not match", () => {
  const items = commandMenuItemsCreate({ projects: [project], query: "hidden metadata", sessions: [session] })

  expect(items.map(({ id }) => id)).toEqual(["session:session-1"])
})

test("command menu matches query tokens across project label and parent folder fields", () => {
  const projectWithParent = {
    ...project,
    parentFolder: { id: "folder-1", label: "UI" },
  }

  const items = commandMenuItemsCreate({ projects: [projectWithParent], query: "ui codeline", sessions: [] })

  expect(items.map(({ id }) => id)).toEqual(["project:project-1"])
})

test("command menu excludes local projects when any query token is missing", () => {
  const projectWithParent = {
    ...project,
    parentFolder: { id: "folder-1", label: "UI" },
  }

  const items = commandMenuItemsCreate({ projects: [projectWithParent], query: "ui nonexistent", sessions: [] })

  expect(items.map(({ id }) => id)).toEqual([])
})
