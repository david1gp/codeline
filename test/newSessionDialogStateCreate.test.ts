import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { activeProjectStateCreate } = await import("../src/ui/activeProjectStateCreate.js")
const { newSessionDialogStateCreate } = await import("../src/ui/newSessionDialogStateCreate.js")
import type { SessionTargetSelectorState } from "../src/ui/sessionTargetSelectorStateCreate.js"
const { signalObjectCreate } = await import("../src/ui/signalObjectCreate.js")

test("confirming an existing project hands off without creating a session", () => {
  const createdProjectPaths: string[] = []
  const newSessionStarts: number[] = []
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const projectPathOverride = signalObjectCreate<string | null>(null)
    const sessionTarget = {
      canCreateSession: () => true,
      isCreatingSession: () => false,
      sessionCreateErrorMessage: () => undefined,
      selectedSessionId: () => null,
      sessionCreateStart: async (projectPath?: string) => {
        createdProjectPaths.push(projectPath ?? "")
        return "session-id"
      },
      sessionCreateStatus: () => "idle" as const,
      sessionNew: () => newSessionStarts.push(1),
    } as unknown as SessionTargetSelectorState
    return {
      dispose,
      projectPathOverride,
      state: newSessionDialogStateCreate({
        activeProject,
        projectPathOverride,
        projects: () => [{ projectLabel: "Codeline", projectPath: "/workspace/codeline" }],
        sessionTarget,
      }),
    }
  })

  root.state.openChange(true)
  root.state.projectChange("/workspace/codeline")
  expect(root.state.primaryActionLabel()).toBe("Use project")
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)

  expect(createdProjectPaths).toEqual([])
  expect(root.state.open()).toBe(false)
  expect(root.projectPathOverride.get()).toBe("/workspace/codeline")
  expect(newSessionStarts).toHaveLength(1)
  root.dispose()
})

test("new project selection opens the project dialog and selects the confirmed path", () => {
  const createdProjectPaths: string[] = []
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const projectPathOverride = signalObjectCreate<string | null>(null)
    return {
      activeProject,
      dispose,
      state: newSessionDialogStateCreate({
        activeProject,
        projectPathOverride,
        projects: () => [],
        sessionTarget: {
          canCreateSession: () => true,
          isCreatingSession: () => false,
          sessionCreateErrorMessage: () => undefined,
          selectedSessionId: () => null,
          sessionCreateStart: async (projectPath?: string) => {
            createdProjectPaths.push(projectPath ?? "")
            return "session-id"
          },
          sessionCreateStatus: () => "idle" as const,
        } as unknown as SessionTargetSelectorState,
      }),
    }
  })

  root.state.openChange(true)
  root.state.projectChange(root.state.newProjectOptionValue)
  // Selecting "New project" only renames the primary action; the project form is
  // not shown until the primary action is submitted.
  expect(root.state.newProjectOpen()).toBe(false)
  expect(root.state.open()).toBe(true)
  expect(root.state.selectedProjectPath()).toBe(root.state.newProjectOptionValue)
  expect(root.state.primaryActionLabel()).toBe("New Project")
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  expect(createdProjectPaths).toEqual([])
  // The single dialog swaps to the project form while staying open (one modal only).
  expect(root.state.newProjectOpen()).toBe(true)
  expect(root.state.open()).toBe(true)
  expect(root.state.dialogTitle()).toBe("New Project")
  // Confirming a project closes the project form and selects the confirmed path.
  root.activeProject.projectActivate({ label: "New", path: "/workspace/new" })
  root.state.projectConfirmed("/workspace/new")
  expect(root.state.newProjectOpen()).toBe(false)
  expect(root.state.open()).toBe(true)
  expect(root.state.dialogTitle()).toBe("New Session")
  expect(root.state.selectedProjectPath()).toBe("/workspace/new")

  root.dispose()
})

test("an existing project handoff navigates from an existing session to the no-session route", () => {
  const [selectedSessionId] = createSignal<string | null>("session-id")
  const newSessionStarts: number[] = []
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const projectPathOverride = signalObjectCreate<string | null>(null)
    const state = newSessionDialogStateCreate({
      activeProject,
      projectPathOverride,
      projects: () => [],
      sessionTarget: {
        canCreateSession: () => true,
        isCreatingSession: () => false,
        sessionCreateErrorMessage: () => undefined,
        selectedSessionId,
        sessionCreateStart: async () => "session-id",
        sessionCreateStatus: () => "creating" as const,
        sessionNew: () => newSessionStarts.push(1),
      } as unknown as SessionTargetSelectorState,
    })
    return {
      activeProject,
      dispose,
      state,
    }
  })

  root.state.openChange(true)
  root.state.projectChange("~")
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)

  expect(root.state.open()).toBe(false)
  expect(root.state.newProjectOpen()).toBe(false)
  expect(selectedSessionId()).toBe("session-id")
  expect(newSessionStarts).toHaveLength(1)
  root.dispose()
})

test("the selected project handoff does not change the active project", () => {
  const activeProject = activeProjectStateCreate({ label: "Active", path: "/workspace/active" })
  const projectPathOverride = signalObjectCreate<string | null>(null)
  const createdProjectPaths: string[] = []
  const sessionTarget = {
    canCreateSession: () => true,
    isCreatingSession: () => false,
    sessionCreateErrorMessage: () => undefined,
    selectedSessionId: () => null,
    sessionCreateStart: async (projectPath?: string) => {
      createdProjectPaths.push(projectPath ?? "")
      return "session-id"
    },
    sessionCreateStatus: () => "idle" as const,
  } as unknown as SessionTargetSelectorState
  const state = newSessionDialogStateCreate({
    activeProject,
    projectPathOverride,
    projects: () => [{ projectLabel: "Other", projectPath: "/workspace/other" }],
    sessionTarget,
  })

  state.openChange(true)
  expect(projectPathOverride.get()).toBe("/workspace/active")
  state.projectChange("/workspace/other")
  expect(projectPathOverride.get()).toBe("/workspace/other")
  state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  expect(createdProjectPaths).toEqual([])
  expect(activeProject.project().path).toBe("/workspace/active")
  expect(projectPathOverride.get()).toBe("/workspace/other")
})

test("New Session lists registered projects with 0 sessions and sets projectIdOverride", () => {
  const activeProject = activeProjectStateCreate({
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc1",
    label: "Active",
    path: "/workspace/active",
  })
  const projectPathOverride = signalObjectCreate<string | null>(null)
  const projectIdOverride = signalObjectCreate<string | null>(null)
  const newSessionStarts: number[] = []

  const registeredProjects = [
    { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc1", label: "Active", parentFolder: null },
    {
      available: true,
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2",
      label: "Zero Session Project",
      parentFolder: null,
    },
    {
      available: false,
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc3",
      label: "Unavailable Project",
      parentFolder: null,
    },
  ]

  const mockRegistry = {
    availableProjects: () => registeredProjects.filter((p) => p.available),
    errorMessage: () => undefined,
    isEmpty: () => false,
    isError: () => false,
    isLoading: () => false,
    openCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectFind: (id: string) => registeredProjects.find((p) => p.id === id),
    projectOpenCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectRegister: async () => ({ success: true as const, data: { project: registeredProjects[0]! } }),
    projectRemove: async () => ({ success: true as const, data: undefined }),
    projectRename: async () => ({ success: true as const, data: { project: registeredProjects[0]! } }),
    projects: () => registeredProjects,
    refresh: () => undefined,
    retry: () => undefined,
    status: () => "ready" as const,
  }

  const state = newSessionDialogStateCreate({
    activeProject,
    projectIdOverride,
    projectPathOverride,
    projectRegistry: mockRegistry,
    sessionTarget: {
      canCreateSession: () => true,
      isCreatingSession: () => false,
      sessionCreateErrorMessage: () => undefined,
      selectedSessionId: () => null,
      sessionCreateStart: async () => "session-id",
      sessionCreateStatus: () => "idle" as const,
      sessionNew: () => newSessionStarts.push(1),
    } as unknown as SessionTargetSelectorState,
  })

  state.openChange(true)
  expect(state.projects()).toHaveLength(2)
  expect(state.selectedProjectId()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc1")

  // Selecting available project with 0 sessions
  state.projectChange("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2")
  expect(state.selectedProjectId()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2")
  expect(projectIdOverride.get()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2")
  expect(projectPathOverride.get()).toBeNull()
  expect(state.canCreateSession()).toBe(true)

  // Selecting unavailable project is prevented / cannot create session
  state.projectChange("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc3")
  expect(state.selectedProjectId()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2")

  // Confirming selection hands off with projectIdOverride
  state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  expect(projectIdOverride.get()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc2")
  expect(projectPathOverride.get()).toBeNull()
  expect(newSessionStarts).toHaveLength(1)
  expect(state.open()).toBe(false)
})

test("New Session when active project is unavailable selects first available project and allows creation", () => {
  const activeProject = activeProjectStateCreate({
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc4",
    label: "Unavailable",
    path: "/workspace/unavailable",
  })
  const projectPathOverride = signalObjectCreate<string | null>(null)
  const projectIdOverride = signalObjectCreate<string | null>(null)
  const newSessionStarts: number[] = []

  const registeredProjects = [
    {
      available: false,
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc4",
      label: "Unavailable Project",
      parentFolder: null,
    },
    {
      available: true,
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc5",
      label: "Available Project",
      parentFolder: null,
    },
  ]

  const mockRegistry = {
    availableProjects: () => registeredProjects.filter((p) => p.available),
    errorMessage: () => undefined,
    isEmpty: () => false,
    isError: () => false,
    isLoading: () => false,
    openCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectFind: (id: string) => registeredProjects.find((p) => p.id === id),
    projectOpenCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectRegister: async () => ({ success: true as const, data: { project: registeredProjects[1]! } }),
    projectRemove: async () => ({ success: true as const, data: undefined }),
    projectRename: async () => ({ success: true as const, data: { project: registeredProjects[1]! } }),
    projects: () => registeredProjects,
    refresh: () => undefined,
    retry: () => undefined,
    status: () => "ready" as const,
  }

  const state = newSessionDialogStateCreate({
    activeProject,
    projectIdOverride,
    projectPathOverride,
    projectRegistry: mockRegistry,
    sessionTarget: {
      canCreateSession: () => true,
      isCreatingSession: () => false,
      sessionCreateErrorMessage: () => undefined,
      selectedSessionId: () => null,
      sessionCreateStart: async () => "session-id",
      sessionCreateStatus: () => "idle" as const,
      sessionNew: () => newSessionStarts.push(1),
    } as unknown as SessionTargetSelectorState,
  })

  state.openChange(true)
  expect(state.projects()).toHaveLength(1)
  expect(state.selectedProjectId()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc5")
  expect(projectIdOverride.get()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc5")
  expect(state.canCreateSession()).toBe(true)
})

test("New Session with empty registry defaults to new project option", () => {
  const activeProject = activeProjectStateCreate()
  const projectPathOverride = signalObjectCreate<string | null>(null)
  const projectIdOverride = signalObjectCreate<string | null>(null)

  const mockRegistry = {
    availableProjects: () => [],
    errorMessage: () => undefined,
    isEmpty: () => true,
    isError: () => false,
    isLoading: () => false,
    openCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectFind: () => undefined,
    projectOpenCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectRegister: async () => ({
      success: true as const,
      data: {
        project: {
          available: true,
          id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc6",
          label: "Brand New",
          parentFolder: null,
        },
      },
    }),
    projectRemove: async () => ({ success: true as const, data: undefined }),
    projectRename: async () => ({
      success: true as const,
      data: {
        project: {
          available: true,
          id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc6",
          label: "Brand New",
          parentFolder: null,
        },
      },
    }),
    projects: () => [],
    refresh: () => undefined,
    retry: () => undefined,
    status: () => "empty" as const,
  }

  const state = newSessionDialogStateCreate({
    activeProject,
    projectIdOverride,
    projectPathOverride,
    projectRegistry: mockRegistry,
    sessionTarget: {
      canCreateSession: () => true,
      isCreatingSession: () => false,
      sessionCreateErrorMessage: () => undefined,
      selectedSessionId: () => null,
      sessionCreateStart: async () => "session-id",
      sessionCreateStatus: () => "idle" as const,
    } as unknown as SessionTargetSelectorState,
  })

  state.openChange(true)
  expect(state.projects()).toHaveLength(0)
  expect(state.selectedProjectId()).toBe(state.newProjectOptionValue)
  expect(state.primaryActionLabel()).toBe("New Project")

  // Submitting opens new project form
  state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  expect(state.newProjectOpen()).toBe(true)

  // Confirming new project registers and sets projectIdOverride
  state.projectConfirmed("/workspace/brand-new", {
    available: true,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc6",
    label: "Brand New",
    parentFolder: null,
  })
  expect(state.newProjectOpen()).toBe(false)
  expect(projectIdOverride.get()).toBe("0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc6")
  expect(projectPathOverride.get()).toBeNull()
})
