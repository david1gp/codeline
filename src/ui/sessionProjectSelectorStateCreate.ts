import { createEffect, useContext } from "solid-js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionProjectSelectorStateOptions = {
  activeProject?: () => ActiveProjectState | undefined
  resources: () => SessionResourceSelectorView
}

/**
 * Owns the controlled New Project dialog outside the dismissing popover and selects
 * its confirmed project after the shared registry refresh makes it available.
 */
export function sessionProjectSelectorStateCreate(options: SessionProjectSelectorStateOptions) {
  const appShell = useContext(appShellContext)
  const fallbackActiveProject = activeProjectStateCreate()
  const newProjectOpen = signalObjectCreate(false)
  // A confirmed project only becomes selectable once the shared registry lists it.
  const pendingProjectId = signalObjectCreate<string | null>(null)

  const resources = () => options.resources()

  createEffect(() => {
    const projectId = pendingProjectId.get()
    if (projectId === null) return
    if (
      !resources()
        .projects()
        .some((project) => project.id === projectId)
    )
      return
    pendingProjectId.set(null)
    resources().projectSelect(projectId)
  })

  return {
    activeProject: (): ActiveProjectState =>
      options.activeProject?.() ?? appShell?.activeProject ?? fallbackActiveProject,
    newProjectConfirmed: (_projectPath: string, project?: ProjectRegistryApiProject) => {
      newProjectOpen.set(false)
      if (project === undefined) return
      pendingProjectId.set(project.id)
    },
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange: (nextOpen: boolean) => newProjectOpen.set(nextOpen),
    newProjectStart: () => newProjectOpen.set(true),
  }
}

export type SessionProjectSelectorState = ReturnType<typeof sessionProjectSelectorStateCreate>
