import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { SessionResourceSelectorView } from "../src/ui/sessionResourceSelectorView.js"

mock.module("solid-js", () => solidRuntime)

const { projectRegistryStateCreate } = await import("../src/project/ui/projectRegistryStateCreate.js")
const { activeProjectStateCreate } = await import("../src/ui/activeProjectStateCreate.js")
const { newProjectDialogStateCreate } = await import("../src/ui/newProjectDialogStateCreate.js")
const { sessionProjectSelectorStateCreate } = await import("../src/ui/sessionProjectSelectorStateCreate.js")
const { signalObjectCreate } = await import("../src/ui/signalObjectCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function conditionWait(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return
    await tick()
  }
  throw new Error("Condition was not met")
}

test("confirmation refreshes the registry and selects the confirmed project in the session selector", async () => {
  const initialProject = {
    available: true,
    faviconUrl: null,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb0",
    label: "Initial Project",
  }
  const registeredProject = {
    available: true,
    faviconUrl: null,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb1",
    label: "Selector Project",
  }
  const events: string[] = []
  let currentProjects = [initialProject]

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (url.startsWith("/api/project/suggestions")) return Response.json({ suggestions: [] })
    if (url === "/api/project/registry" && method === "POST") {
      events.push("confirm")
      currentProjects = [initialProject, registeredProject]
      return Response.json({ project: registeredProject })
    }
    if (url === "/api/project/registry" && method === "GET") {
      events.push(currentProjects.length === 1 ? "initial-registry" : "refreshed-registry")
      return Response.json({ folders: [], projects: currentProjects, truncated: false })
    }
    return Response.json({})
  }

  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const selectedProjectId = signalObjectCreate<string | null>(null)
    const projectRegistry = projectRegistryStateCreate({ accountId: () => "user-1", fetch: fetcher })
    const resources = {
      projects: projectRegistry.availableProjects,
      projectSelect: (projectId: string) => {
        events.push("selected")
        selectedProjectId.set(projectId)
      },
    } as SessionResourceSelectorView
    const selector = sessionProjectSelectorStateCreate({
      activeProject: () => activeProject,
      resources: () => resources,
    })
    const dialog = newProjectDialogStateCreate({
      activeProject,
      debounceMs: 0,
      fetch: fetcher,
      onProjectConfirmed: selector.newProjectConfirmed,
      open: selector.newProjectOpen,
      projectRegistry,
    })

    return { dialog, dispose, projectRegistry, selectedProjectId, selector }
  })

  await conditionWait(() => root.projectRegistry.projects().length === 1)
  root.selector.newProjectStart()
  expect(root.selector.newProjectOpen()).toBe(true)
  await tick()
  expect(root.selector.newProjectOpen()).toBe(true)

  root.dialog.pathChange("/workspace/selector-project")
  expect(await root.dialog.projectConfirm()).toBe(true)
  await conditionWait(() => root.selectedProjectId.get() === registeredProject.id)

  expect(root.selector.newProjectOpen()).toBe(false)
  expect(root.projectRegistry.projects().map((project) => project.id)).toEqual([
    initialProject.id,
    registeredProject.id,
  ])
  expect(root.selectedProjectId.get()).toBe(registeredProject.id)
  expect(events.indexOf("confirm")).toBeLessThan(events.indexOf("refreshed-registry"))
  expect(events.indexOf("refreshed-registry")).toBeLessThan(events.indexOf("selected"))

  root.dispose()
})
