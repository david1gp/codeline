import type { Accessor } from "solid-js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type NewSessionProject = {
  projectLabel: string
  projectPath: string
}

type NewSessionDialogStateOptions = {
  activeProject: ActiveProjectState
  projectPathOverride: SessionProjectPathOverride
  projects: Accessor<readonly NewSessionProject[]>
  sessionTarget: SessionTargetSelectorState
}

const newProjectOptionValue = "__new_project__"

export function newSessionDialogStateCreate(options: NewSessionDialogStateOptions) {
  const open = signalObjectCreate(false)
  const newProjectOpen = signalObjectCreate(false)
  const newProjectSelected = signalObjectCreate(false)
  const selectedProjectPath = () =>
    newProjectSelected.get()
      ? newProjectOptionValue
      : (options.projectPathOverride.get() ?? options.activeProject.project().path)

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
    if (nextOpen) {
      newProjectSelected.set(false)
      options.projectPathOverride.set(options.activeProject.project().path)
    }
    if (!nextOpen) {
      newProjectSelected.set(false)
      options.projectPathOverride.set(null)
    }
    if (!nextOpen) newProjectOpen.set(false)
  }
  // The project form is shown inside the same dialog, so only one modal is ever
  // open and the nested overlays cannot dismiss each other.
  const newProjectStart = () => newProjectOpen.set(true)
  const newProjectOpenChange = (nextOpen: boolean) => newProjectOpen.set(nextOpen)
  const projectChange = (projectPath: string) => {
    if (projectPath === newProjectOptionValue) {
      newProjectSelected.set(true)
      options.projectPathOverride.set(null)
      return
    }
    if (!projects().some((project) => project.projectPath === projectPath)) return
    newProjectSelected.set(false)
    options.projectPathOverride.set(projectPath)
  }
  const projectSelectionConfirm = () => {
    const projectPath = selectedProjectPath()
    if (projectPath === newProjectOptionValue) return
    if (!projects().some((project) => project.projectPath === projectPath)) return
    options.projectPathOverride.set(projectPath)
    open.set(false)
    options.sessionTarget.sessionNew?.()
  }

  return {
    canCreateSession: () => options.sessionTarget.canCreateSession() && selectedProjectPath().length > 0,
    dialogDescription: () =>
      newProjectOpen.get()
        ? "Select an existing folder. Codeline will not create a directory."
        : "Choose the project for this session.",
    dialogTitle: () => (newProjectOpen.get() ? "New Project" : "New Session"),
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      if (selectedProjectPath() === newProjectOptionValue) {
        newProjectStart()
        return
      }
      projectSelectionConfirm()
    },
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange,
    newProjectOptionValue,
    primaryActionLabel: () => {
      if (selectedProjectPath() === newProjectOptionValue) return "New Project"
      return "Use project"
    },
    open: open.get,
    openChange,
    projectChange,
    projectSelectionConfirm,
    projectConfirmed: (projectPath: string) => {
      newProjectOpen.set(false)
      projectChange(projectPath)
    },
    projects,
    selectedProjectPath,
    sessionCreateErrorMessage: options.sessionTarget.sessionCreateErrorMessage,
    sessionCreateStatus: options.sessionTarget.sessionCreateStatus,
  }
}

export type NewSessionDialogState = ReturnType<typeof newSessionDialogStateCreate>
