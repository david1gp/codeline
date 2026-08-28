import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { activeProjectStateCreate } from "../src/ui/activeProjectStateCreate.js"
import { newSessionDialogStateCreate } from "../src/ui/newSessionDialogStateCreate.js"
import type { SessionTargetSelectorState } from "../src/ui/sessionTargetSelectorStateCreate.js"
import { signalObjectCreate } from "../src/ui/signalObjectCreate.js"

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
