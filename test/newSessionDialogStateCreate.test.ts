import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
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
  root.state.formSubmit({ preventDefault: () => undefined } as SubmitEvent)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(createdProjectPaths).toEqual(["/workspace/codeline"])
  expect(root.state.open()).toBe(false)
  root.dispose()
})

test("new project selection opens the project dialog and selects the confirmed path", () => {
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    return {
      activeProject,
      dispose,
      state: newSessionDialogStateCreate({
        activeProject,
        projects: () => [],
        sessionTarget: {} as SessionTargetSelectorState,
      }),
    }
  })

  root.state.projectChange(root.state.newProjectOptionValue)
  expect(root.state.newProjectOpen()).toBe(true)
  root.activeProject.projectActivate({ label: "New", path: "/workspace/new" })
  root.state.projectChange("/workspace/new")
  expect(root.state.selectedProjectPath()).toBe("/workspace/new")

  root.dispose()
})
