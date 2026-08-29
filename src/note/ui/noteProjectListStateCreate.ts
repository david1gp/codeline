import { useContext } from "solid-js"
import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import { type ProjectRegistryState, projectRegistryStateCreate } from "../../project/ui/projectRegistryStateCreate.js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import { appShellContext } from "../../ui/appShellContext.js"

type NoteProjectListStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry?: ProjectRegistryState
}

export function noteProjectListStateCreate(options: NoteProjectListStateOptions = {}) {
  const appShell = useContext(appShellContext)
  const account = useContext(applicationAccountContext)
  const registry =
    options.projectRegistry ??
    appShell?.projectRegistry ??
    projectRegistryStateCreate({
      accountId: options.accountId ?? (() => account?.userId() ?? null),
      fetch: options.fetcher,
    })

  const projects = (): readonly ProjectRegistryApiProject[] => registry.projects()
  const availableProjects = (): readonly ProjectRegistryApiProject[] => registry.availableProjects()

  const revalidate = () => {
    registry.refresh()
  }

  return {
    availableProjects,
    projects,
    refresh: revalidate,
    revalidate,
  }
}

export type NoteProjectListState = ReturnType<typeof noteProjectListStateCreate>
