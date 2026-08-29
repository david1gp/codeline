import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const windowNavigation = {
  innerWidth: 1440,
  location: { href: "https://codeline.test/sessions" },
  history: { pushState: () => {}, replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}
Object.defineProperty(globalThis, "window", { configurable: true, value: windowNavigation })

const { projectRegistryStateCreate } = await import("../src/project/ui/projectRegistryStateCreate.js")
const { sessionListStateCreate } = await import("../src/ui/sessionListStateCreate.js")
const { newSessionDialogStateCreate } = await import("../src/ui/newSessionDialogStateCreate.js")
const { newProjectDialogStateCreate } = await import("../src/ui/newProjectDialogStateCreate.js")
const { filesPageStateCreate } = await import("../src/ui/filesPageStateCreate.js")
const { notesPageStateCreate } = await import("../src/note/ui/notesPageStateCreate.js")
const { activeProjectStateCreate } = await import("../src/ui/activeProjectStateCreate.js")
const { sessionNavigationStateCreate } = await import("../src/ui/sessionNavigationStateCreate.js")
const { sessionTargetSelectorStateCreate } = await import("../src/ui/sessionTargetSelectorStateCreate.js")
const { signalObjectCreate } = await import("../src/ui/signalObjectCreate.js")
const { appShellContext } = await import("../src/ui/appShellContext.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("registering a new project refreshes shared registry and updates sidebar, New Session, Files, and Notes", async () => {
  const initialProject = {
    available: true,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f90",
    label: "Initial Project",
  }
  const registeredProject = {
    available: true,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f91",
    label: "Newly Registered",
  }
  let currentProjects = [initialProject]

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (url === "/api/project/registry" && method === "GET") {
      return Response.json({ folders: [], projects: currentProjects, truncated: false })
    }

    if (url === "/api/project/registry" && method === "POST") {
      currentProjects = [initialProject, registeredProject]
      return Response.json({ project: registeredProject })
    }

    if (url.startsWith("/api/sessions")) {
      return Response.json({
        asOfCursor: "cursor-1",
        etag: '"etag-1"',
        nextCursor: null,
        revision: 1,
        schemaVersion: "session-list.v3",
        sessions: [],
      })
    }

    if (url === "/api/notes") {
      return Response.json([
        {
          content: "Initial note",
          createdAt: 100,
          id: "note-1",
          projectId: initialProject.id,
          projectPath: initialProject.id,
          revision: 1,
          sortOrder: 0,
          updatedAt: 100,
          userId: "user-1",
        },
        {
          content: "Note in new project",
          createdAt: 200,
          id: "note-2",
          projectId: registeredProject.id,
          projectPath: registeredProject.id,
          revision: 1,
          sortOrder: 1,
          updatedAt: 200,
          userId: "user-1",
        },
      ])
    }

    return Response.json({})
  }

  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const navigation = sessionNavigationStateCreate()
    const projectPathOverride = signalObjectCreate<string | null>(null)
    const projectIdOverride = signalObjectCreate<string | null>(null)

    const projectRegistry = projectRegistryStateCreate({
      accountId: () => "user-1",
      fetch: fetcher,
    })

    const sessionTarget = sessionTargetSelectorStateCreate({
      accountId: () => "user-1",
      activeProjectId: () => projectIdOverride.get() ?? activeProject.project().id ?? null,
      activeProjectPath: () => projectPathOverride.get() ?? activeProject.project().path,
      isOnline: () => true,
      pendingAgentPrompt: () => undefined,
      pendingExecutionSelection: () => undefined,
      pendingInstructionOverrides: () => ({}),
      pendingSkillSelection: () => undefined,
      selectedSessionId: navigation.selectedSessionId,
      sessionSelect: () => undefined,
    })

    const sidebar = sessionListStateCreate(() => navigation, undefined, {
      fetcher,
      projectRegistry,
    })

    const newSession = newSessionDialogStateCreate({
      activeProject,
      projectIdOverride,
      projectPathOverride,
      projectRegistry,
      sessionTarget,
    })

    const files = filesPageStateCreate({
      accountId: () => "user-1",
      fetcher,
      projectRegistry,
    })

    const notes = notesPageStateCreate({
      accountId: () => "user-1",
      fetcher,
      projectRegistry,
    })

    const newProjectDialog = newProjectDialogStateCreate({
      activeProject,
      debounceMs: 0,
      fetch: fetcher,
      projectRegistry,
    })

    return {
      activeProject,
      dispose,
      files,
      newProjectDialog,
      newSession,
      notes,
      projectRegistry,
      sidebar,
    }
  })

  await tick()

  // Initial state check
  expect(root.projectRegistry.projects()).toHaveLength(1)
  expect(root.sidebar.sidebar.projectGroups()).toHaveLength(1)
  expect(root.sidebar.sidebar.projectGroups()[0]?.projectLabel).toBe("Initial Project")
  expect(root.newSession.projects()).toHaveLength(1)
  expect(root.newSession.projects()[0]?.label).toBe("Initial Project")
  expect(root.files.projects()).toHaveLength(1)
  expect(root.files.projects()[0]?.label).toBe("Initial Project")
  expect(root.notes.groups().find((g) => g.projectId === initialProject.id)?.label).toBe("Initial Project")
  expect(root.notes.groups().find((g) => g.projectPath === registeredProject.id)?.label).toBe(registeredProject.id)

  // Simulate registering a project from the New Project dialog (e.g. from Projects sidebar)
  root.newProjectDialog.pathChange("/workspace/newly-registered")
  const success = await root.newProjectDialog.projectConfirm()
  expect(success).toBe(true)

  await tick()

  // Verify all consumers immediately updated to include the newly registered project
  expect(root.projectRegistry.projects()).toHaveLength(2)
  expect(root.sidebar.sidebar.projectGroups()).toHaveLength(2)
  expect(root.sidebar.sidebar.projectGroups().map((group) => group.projectLabel)).toContain("Newly Registered")
  expect(root.newSession.projects()).toHaveLength(2)
  expect(root.newSession.projects().map((project) => project.label)).toContain("Newly Registered")
  expect(root.files.projects()).toHaveLength(2)
  expect(root.files.projects().map((project) => project.label)).toContain("Newly Registered")
  expect(root.notes.groups().find((g) => g.projectPath === registeredProject.id)?.label).toBe("Newly Registered")

  root.dispose()
})

test("New Project dialog without explicit projectRegistry prop inherits and refreshes shared registry via context", async () => {
  const initialProject = {
    available: true,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa0",
    label: "Initial Project",
  }
  const registeredProject = {
    available: true,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa1",
    label: "Via Context",
  }
  let currentProjects = [initialProject]

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (url === "/api/project/registry" && method === "GET") {
      return Response.json({ folders: [], projects: currentProjects, truncated: false })
    }

    if (url === "/api/project/registry" && method === "POST") {
      currentProjects = [initialProject, registeredProject]
      return Response.json({ project: registeredProject })
    }

    return Response.json({})
  }

  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const projectRegistry = projectRegistryStateCreate({
      accountId: () => "user-1",
      fetch: fetcher,
    })

    // Simulate provider context containing shared appShell
    let newProjectDialog!: ReturnType<typeof newProjectDialogStateCreate>
    const mockAppShell = { projectRegistry } as unknown as Parameters<typeof appShellContext.Provider>[0]["value"]

    ;(
      solidRuntime as unknown as { createComponent: (comp: unknown, props: Record<string, unknown>) => unknown }
    ).createComponent(appShellContext.Provider, {
      value: mockAppShell,
      get children() {
        newProjectDialog = newProjectDialogStateCreate({
          activeProject,
          debounceMs: 0,
          fetch: fetcher,
        })
        return null
      },
    })

    return {
      activeProject,
      dispose,
      newProjectDialog,
      projectRegistry,
    }
  })

  await tick()
  expect(root.projectRegistry.projects()).toHaveLength(1)

  root.newProjectDialog.pathChange("/workspace/via-context")
  const success = await root.newProjectDialog.projectConfirm()
  expect(success).toBe(true)

  await tick()
  expect(root.projectRegistry.projects()).toHaveLength(2)
  expect(root.projectRegistry.projects().map((p) => p.label)).toContain("Via Context")

  root.dispose()
})
