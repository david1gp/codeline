import type { Accessor } from "solid-js"
import { createEffect } from "solid-js/dist/solid.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type NewSessionProject = {
  projectLabel: string
  projectPath: string
}

type NewSessionDialogStateOptions = {
  activeProject: ActiveProjectState
  projects: Accessor<readonly NewSessionProject[]>
  sessionTarget: SessionTargetSelectorState
}

const newProjectOptionValue = "__new_project__"

export function newSessionDialogStateCreate(options: NewSessionDialogStateOptions) {
  const open = signalObjectCreate(false)
  const newProjectOpen = signalObjectCreate(false)
  const selectedProjectPath = signalObjectCreate(options.activeProject.project().path)
  let sessionCreationPendingRoute = false

  const projects = () => {
    const current = options.activeProject.project()
    const allProjects = [{ projectLabel: current.label, projectPath: current.path }, ...options.projects()]
    const paths = new Set<string>()
    return allProjects.filter((project) => {
      if (paths.has(project.projectPath)) return false
      paths.add(project.projectPath)
      return true
    })
  }
  const openChange = (nextOpen: boolean) => {
    open.set(nextOpen)
    sessionCreationPendingRoute = false
    if (nextOpen) selectedProjectPath.set(options.activeProject.project().path)
    if (!nextOpen) newProjectOpen.set(false)
  }
  // The project form is shown inside the same dialog, so only one modal is ever
  // open and the nested overlays cannot dismiss each other.
  const newProjectStart = () => newProjectOpen.set(true)
  const newProjectOpenChange = (nextOpen: boolean) => newProjectOpen.set(nextOpen)
  const projectChange = (projectPath: string) => {
    if (projectPath === newProjectOptionValue) {
      selectedProjectPath.set(newProjectOptionValue)
      return
    }
    if (!projects().some((project) => project.projectPath === projectPath)) return
    selectedProjectPath.set(projectPath)
  }
  const sessionCreate = async () => {
    if (!options.sessionTarget.canCreateSession() || options.sessionTarget.isCreatingSession()) return
    sessionCreationPendingRoute = true
    const sessionId = await options.sessionTarget.sessionCreateStart(selectedProjectPath.get())
    if (sessionId !== null) openChange(false)
    if (sessionId === null) sessionCreationPendingRoute = false
  }

  createEffect(() => {
    const selectedSessionId = options.sessionTarget.selectedSessionId()
    if (!sessionCreationPendingRoute || selectedSessionId === null) return
    openChange(false)
  })

  return {
    canCreateSession: () => options.sessionTarget.canCreateSession() && selectedProjectPath.get().length > 0,
    dialogDescription: () =>
      newProjectOpen.get()
        ? "Select an existing folder. Codeline will not create a directory."
        : "Choose the project for this session.",
    dialogTitle: () => (newProjectOpen.get() ? "New Project" : "New Session"),
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      if (selectedProjectPath.get() === newProjectOptionValue) {
        newProjectStart()
        return
      }
      void sessionCreate()
    },
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange,
    newProjectOptionValue,
    primaryActionLabel: () => {
      if (options.sessionTarget.sessionCreateStatus() === "creating") return "Creating..."
      if (selectedProjectPath.get() === newProjectOptionValue) return "New Project"
      return "Start session"
    },
    open: open.get,
    openChange,
    projectChange,
    projectConfirmed: (projectPath: string) => {
      newProjectOpen.set(false)
      projectChange(projectPath)
    },
    projects,
    selectedProjectPath: selectedProjectPath.get,
    sessionCreateErrorMessage: options.sessionTarget.sessionCreateErrorMessage,
    sessionCreateStatus: options.sessionTarget.sessionCreateStatus,
  }
}

export type NewSessionDialogState = ReturnType<typeof newSessionDialogStateCreate>
