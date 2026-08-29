import { createSignal, useContext } from "solid-js"
import * as v from "valibot"
import { projectApiProjectQuerySchema } from "../project/api/projectApiProjectQuerySchema.js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import { type ProjectRegistryState, projectRegistryStateCreate } from "../project/ui/projectRegistryStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import { applicationAccountContext } from "./applicationAccountContext.js"

const filesSelectedProjectStorageKey = "codeline.explorer.selectedProjectId"

type FilesPageStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry?: ProjectRegistryState
  storage?: Pick<Storage, "getItem" | "setItem">
}

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

function filesSelectedProjectStorageResolve(
  storage: FilesPageStateOptions["storage"],
): FilesPageStateOptions["storage"] {
  if (storage !== undefined) return storage

  try {
    return globalThis.localStorage
  } catch (_error: unknown) {
    return undefined
  }
}

function filesSelectedProjectIdRead(storage: FilesPageStateOptions["storage"]): string | null {
  try {
    const stored = storage?.getItem(filesSelectedProjectStorageKey)
    const parsed = v.safeParse(projectApiProjectQuerySchema, { project: stored })
    return parsed.success ? parsed.output.project : null
  } catch (_error: unknown) {
    return null
  }
}

function filesSelectedProjectIdWrite(storage: FilesPageStateOptions["storage"], projectId: string): void {
  try {
    storage?.setItem(filesSelectedProjectStorageKey, projectId)
  } catch (_error: unknown) {
    // The selected project remains available in memory when storage is unavailable.
  }
}

export function filesPageStateCreate(options: FilesPageStateOptions = {}) {
  const appShell = useContext(appShellContext)
  const account = useContext(applicationAccountContext)
  const registry =
    options.projectRegistry ??
    appShell?.projectRegistry ??
    projectRegistryStateCreate({
      accountId: options.accountId ?? (() => account?.userId() ?? null),
      fetch: options.fetcher,
    })

  const storage = filesSelectedProjectStorageResolve(options.storage)
  const persistedProjectId = filesSelectedProjectIdRead(storage)
  const selectedProjectId = createSignalObject<string | null>(persistedProjectId)

  const availableProjects = (): readonly ProjectRegistryApiProject[] => registry.availableProjects()

  const selectedProject = (): ProjectRegistryApiProject | null => {
    const available = availableProjects()
    if (available.length === 0) return null
    const currentId = selectedProjectId.get()
    if (currentId !== null) {
      const match = available.find((project) => project.id === currentId)
      if (match !== undefined) return match
    }
    return available[0] ?? null
  }

  const status = (): "error" | "loading" | "ready" => {
    if (registry.isError()) return "error"
    if (registry.isLoading() && registry.projects().length === 0) return "loading"
    return "ready"
  }

  return {
    projects: availableProjects,
    truncated: () => false,
    projectSelect: (projectId: string) => {
      const match = availableProjects().find((project) => project.id === projectId)
      if (match === undefined) return
      selectedProjectId.set(projectId)
      filesSelectedProjectIdWrite(storage, projectId)
    },
    retry: () => {
      registry.retry()
    },
    selectedProject,
    status,
  }
}
