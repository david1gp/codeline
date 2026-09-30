import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"

mock.module("solid-js", () => solidRuntime)

const { commandMenuStateCreate } = await import("./commandMenuStateCreate.js")

function sessionPage(title: string, nextCursor: string | null) {
  return Response.json({
    asOfCursor: "cursor-current",
    etag: '"etag"',
    nextCursor,
    revision: 1,
    schemaVersion: "3",
    sessions: [
      {
        archivedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        id: `session-${title}`,
        metadata: {},
        parentSessionId: null,
        pinned: false,
        primaryAgentId: "agent-1",
        projectPath: "/work/codeline",
        revision: 1,
        serverId: "server-1",
        title,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  })
}

test("command menu cancels stale searches and can load subsequent server result pages", async () => {
  let staleResolve: ((response: Response) => void) | undefined
  let staleSignal: AbortSignal | undefined
  const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://preview.codeline.work")
    if (url.searchParams.get("search") === "stale") {
      staleSignal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        staleResolve = resolve
      })
    }
    if (url.searchParams.get("cursor") === "page-2") return Promise.resolve(sessionPage("Current second page", null))
    if (url.searchParams.get("search") === "current") return Promise.resolve(sessionPage("Current match", "page-2"))
    throw new Error(`Unexpected command-menu request: ${url}`)
  }
  const projectRegistry = {
    availableProjects: () => [],
    status: () => "empty" as const,
  } as unknown as ProjectRegistryState
  const root = createRoot((dispose) => ({ dispose, state: commandMenuStateCreate({ fetcher, projectRegistry }) }))

  root.state.querySet("stale")
  for (let attempt = 0; staleResolve === undefined && attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(staleResolve).toBeDefined()
  root.state.querySet("current")
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(staleSignal?.aborted).toBe(true)
  expect(staleResolve).toBeDefined()
  expect(root.state.items().map(({ label }) => label)).toContain("Current match")
  expect(root.state.items().map(({ label }) => label)).not.toContain("Stale match")
  expect(root.state.hasMoreSessions()).toBe(true)

  root.state.loadMoreSessions()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.items().map(({ label }) => label)).toContain("Current second page")
  expect(root.state.hasMoreSessions()).toBe(false)

  staleResolve?.(sessionPage("Stale match", null))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.items().map(({ label }) => label)).not.toContain("Stale match")
  root.dispose()
})

test("command menu reflects project registry updates without fetching a separate snapshot", () => {
  const firstProject: ProjectRegistryApiProject = {
    available: true,
    faviconUrl: null,
    id: "project-first",
    label: "First project",
    parentFolder: null,
  }
  const nextProject: ProjectRegistryApiProject = {
    ...firstProject,
    id: "project-next",
    label: "Renamed project",
  }
  const root = createRoot((dispose) => {
    const [projects, setProjects] = solidRuntime.createSignal<readonly ProjectRegistryApiProject[]>([firstProject])
    const registry = {
      availableProjects: projects,
      status: () => "ready" as const,
    } as unknown as ProjectRegistryState
    return { dispose, projectsSet: setProjects, state: commandMenuStateCreate({ projectRegistry: registry }) }
  })

  expect(root.state.items().map(({ label }) => label)).toContain("First project")
  root.projectsSet([nextProject])
  expect(root.state.items().map(({ label }) => label)).toContain("Renamed project")
  expect(root.state.items().map(({ label }) => label)).not.toContain("First project")
  root.dispose()
})
