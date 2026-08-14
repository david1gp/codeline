import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { ProjectApiListResponse } from "../project/api/projectApiListResponseSchema.js"
import { projectApiListResponseSchema } from "../project/api/projectApiListResponseSchema.js"

type FilesPageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function filesPageStateCreate(options: FilesPageStateOptions = {}) {
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const projects = createSignalObject<ProjectApiListResponse["projects"]>([])
  const selectedProjectId = createSignalObject<string | null>(null)
  const status = createSignalObject<"error" | "loading" | "ready">("loading")
  const legacySingleRoot = createSignalObject(false)
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
      selectedProjectId.set(parsed.output.projects[0]?.id ?? null)
      legacySingleRoot.set(response.headers.get("X-Codeline-Project-Mode") === "legacy-single-root")
      truncated.set(parsed.output.truncated)
      status.set("ready")
    } catch (_error: unknown) {
      if (requestController.signal.aborted || version !== requestVersion) return
      projects.set([])
      selectedProjectId.set(null)
      legacySingleRoot.set(false)
      truncated.set(false)
      status.set("error")
    }
  }

  void load()
  onCleanup(() => controller?.abort())

  return {
    projects: projects.get,
    legacySingleRoot: legacySingleRoot.get,
    truncated: truncated.get,
    projectSelect: (event: Event & { currentTarget: HTMLSelectElement }) => {
      const projectId = event.currentTarget.value
      if (projects.get().some((project) => project.id === projectId)) selectedProjectId.set(projectId)
    },
    retry: () => void load(),
    selectedProject: () => projects.get().find((project) => project.id === selectedProjectId.get()) ?? null,
    status: status.get,
  }
}
