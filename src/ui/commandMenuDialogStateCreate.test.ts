import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { CommandIntent } from "./commandIntent.js"
import type { CommandMenuItem } from "./commandMenuItem.js"
import type { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"

const navigated: string[] = []
const dispatched: CommandIntent[] = []
const projectSelections: string[] = []

mock.module("solid-js", () => solidRuntime)
mock.module("@solidjs/router", () => ({ useNavigate: () => (href: string) => navigated.push(href) }))
mock.module("./commandMenuStateCreate.js", () => ({ commandMenuStateCreate: () => ({ querySet: () => {} }) }))

const { commandMenuDialogStateCreate } = await import("./commandMenuDialogStateCreate.js")

const navigation = {
  commandDispatch: (intent: CommandIntent) => dispatched.push(intent),
  workspaceActions: { sessionInProject: (id: string) => projectSelections.push(id) },
} as unknown as ReturnType<typeof primaryNavigationStateCreate>

test("palette hands focus to selected dialogs but restores it on Escape and session navigation", () => {
  const previousWindow = globalThis.window
  globalThis.window = new EventTarget() as Window & typeof globalThis
  const projectRegistry = { availableProjects: () => [], status: () => "empty" } as unknown as ProjectRegistryState
  const root = createRoot((dispose) => ({ dispose, state: commandMenuDialogStateCreate(navigation, projectRegistry) }))
  const state = root.state
  const newProject: CommandMenuItem = {
    description: "Register a folder",
    id: "action:new-project",
    intent: { kind: "new-project" },
    kind: "action",
    keywords: [],
    label: "New project",
  }

  state.openChange(true)
  expect(state.restoreFocus()).toBe(true)
  state.openChange(false)
  expect(state.restoreFocus()).toBe(true)

  state.openChange(true)
  state.itemSelect(newProject)
  expect(state.open()).toBe(false)
  expect(state.restoreFocus()).toBe(false)
  expect(dispatched).toEqual([{ kind: "new-project" }])

  state.openChange(true)
  expect(state.restoreFocus()).toBe(true)
  state.itemSelect({ ...newProject, id: "action:new-session", intent: { kind: "new-session" } })
  expect(state.restoreFocus()).toBe(false)
  expect(dispatched.at(-1)).toEqual({ kind: "new-session" })

  state.openChange(true)
  state.itemSelect({
    description: "Start a session",
    id: "project:project-1",
    kind: "project",
    keywords: [],
    label: "Project",
    projectId: "project-1",
  })
  expect(state.restoreFocus()).toBe(false)
  expect(projectSelections).toEqual(["project-1"])

  state.openChange(true)
  state.itemSelect({
    description: "Open session",
    href: "/sessions/session-1",
    id: "session:session-1",
    kind: "session",
    keywords: [],
    label: "Session",
  })
  expect(state.restoreFocus()).toBe(true)
  expect(navigated).toEqual(["/sessions/session-1"])
  root.dispose()
  globalThis.window = previousWindow
})
