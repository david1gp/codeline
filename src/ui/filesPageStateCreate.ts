import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { ProjectApiListResponse } from "../project/api/projectApiListResponseSchema.js"
import { projectApiListResponseSchema } from "../project/api/projectApiListResponseSchema.js"
import { projectApiProjectQuerySchema } from "../project/api/projectApiProjectQuerySchema.js"

const filesSelectedProjectStorageKey = "codeline.explorer.selectedProjectId"

type FilesPageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
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
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const storage = filesSelectedProjectStorageResolve(options.storage)
  const persistedProjectId = filesSelectedProjectIdRead(storage)
  const projects = createSignalObject<ProjectApiListResponse["projects"]>([])
  const selectedProjectId = createSignalObject<string | null>(null)
  const status = createSignalObject<"error" | "loading" | "ready">("loading")
  const truncated = createSignalObject(false)
  let controller: AbortController | undefined
  let requestVersion = 0

  const load = async () => {
    const version = requestVersion + 1
    requestVersion = version
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    status.set("loading")

    try {
      const response = await fetcher(`${apiBase}/list`, { signal: requestController.signal })
      if (!response.ok) throw new Error("The project list request failed.")
      const parsed = v.safeParse(projectApiListResponseSchema, await response.json())
      if (!parsed.success) throw new Error("The project list response is invalid.")
      if (requestController.signal.aborted || version !== requestVersion) return

      projects.set(parsed.output.projects)
      const previousProjectId = selectedProjectId.get() ?? persistedProjectId
      const selectedProject =
        parsed.output.projects.find((project) => project.id === previousProjectId) ?? parsed.output.projects[0] ?? null
      selectedProjectId.set(selectedProject?.id ?? null)
      if (selectedProject !== null) filesSelectedProjectIdWrite(storage, selectedProject.id)
      truncated.set(parsed.output.truncated)
      status.set("ready")
    } catch (_error: unknown) {
      if (requestController.signal.aborted || version !== requestVersion) return
      projects.set([])
      selectedProjectId.set(null)
      truncated.set(false)
      status.set("error")
    }
  }

  void load()
  onCleanup(() => controller?.abort())

  return {
    projects: projects.get,
    truncated: truncated.get,
    projectSelect: (event: Event & { currentTarget: HTMLSelectElement }) => {
      const projectId = event.currentTarget.value
      if (!projects.get().some((project) => project.id === projectId)) return
      selectedProjectId.set(projectId)
      filesSelectedProjectIdWrite(storage, projectId)
    },
    retry: () => void load(),
    selectedProject: () => projects.get().find((project) => project.id === selectedProjectId.get()) ?? null,
    status: status.get,
  }
}
