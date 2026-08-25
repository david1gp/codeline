import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { activeProjectStateCreate } from "../src/ui/activeProjectStateCreate.js"
import { newSessionDialogStateCreate } from "../src/ui/newSessionDialogStateCreate.js"
import type { SessionTargetSelectorState } from "../src/ui/sessionTargetSelectorStateCreate.js"

test("session creation uses the selected project", async () => {
  const createdProjectPaths: string[] = []
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
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
    return {
      dispose,
      state: newSessionDialogStateCreate({
        activeProject,
        projects: () => [{ projectLabel: "Codeline", projectPath: "/workspace/codeline" }],
        sessionTarget,
      }),
    }
  })

  root.state.openChange(true)
  root.state.projectChange("/workspace/codeline")
  expect(root.state.primaryActionLabel()).toBe("Start session")
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(createdProjectPaths).toEqual(["/workspace/codeline"])
  expect(root.state.open()).toBe(false)
  root.dispose()
})

test("new project selection opens the project dialog and selects the confirmed path", () => {
  const createdProjectPaths: string[] = []
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    return {
      activeProject,
      dispose,
      state: newSessionDialogStateCreate({
        activeProject,
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

test("session route selection closes the modal and clears the project form", async () => {
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let resolveCreate: ((sessionId: string) => void) | undefined
  let dialogState: ReturnType<typeof newSessionDialogStateCreate> | undefined
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    const state = newSessionDialogStateCreate({
      activeProject,
      projects: () => [],
      sessionTarget: {
        canCreateSession: () => true,
        isCreatingSession: () => false,
        sessionCreateErrorMessage: () => undefined,
        selectedSessionId,
        sessionCreateStart: () =>
          new Promise<string>((resolve) => {
            resolveCreate = resolve
            dialogState?.newProjectOpenChange(true)
            setSelectedSessionId("session-id")
          }),
        sessionCreateStatus: () => "creating" as const,
      } as unknown as SessionTargetSelectorState,
    })
    dialogState = state
    return {
      activeProject,
      dispose,
      state,
    }
  })

  root.state.openChange(true)
  root.state.projectChange(root.state.newProjectOptionValue)
  root.state.projectChange("~")
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(root.state.open()).toBe(false)
  expect(root.state.newProjectOpen()).toBe(false)
  resolveCreate?.("session-id")
  root.dispose()
})
