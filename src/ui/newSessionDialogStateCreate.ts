import type { Accessor } from "solid-js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

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
    if (nextOpen) selectedProjectPath.set(options.activeProject.project().path)
    if (!nextOpen) newProjectOpen.set(false)
  }
  const projectChange = (projectPath: string) => {
    if (projectPath === newProjectOptionValue) {
      newProjectOpen.set(true)
      return
    }
    if (!projects().some((project) => project.projectPath === projectPath)) return
    selectedProjectPath.set(projectPath)
  }
  const sessionCreate = async () => {
    if (!options.sessionTarget.canCreateSession() || options.sessionTarget.isCreatingSession()) return
    const sessionId = await options.sessionTarget.sessionCreateStart(selectedProjectPath.get())
    if (sessionId !== null) openChange(false)
  }

  return {
    canCreateSession: () => options.sessionTarget.canCreateSession() && selectedProjectPath.get().length > 0,
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void sessionCreate()
    },
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange: (nextOpen: boolean) => newProjectOpen.set(nextOpen),
    newProjectOptionValue,
    open: open.get,
    openChange,
    projectChange,
    projects,
    selectedProjectPath: selectedProjectPath.get,
    sessionCreateErrorMessage: options.sessionTarget.sessionCreateErrorMessage,
    sessionCreateStatus: options.sessionTarget.sessionCreateStatus,
  }
}

export type NewSessionDialogState = ReturnType<typeof newSessionDialogStateCreate>
