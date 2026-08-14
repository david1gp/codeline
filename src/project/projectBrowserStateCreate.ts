import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { ProjectApiDirectoryResponse } from "./api/projectApiDirectoryResponseSchema.js"
import { projectApiDirectoryResponseSchema } from "./api/projectApiDirectoryResponseSchema.js"
import type { ProjectApiPreviewResponse } from "./api/projectApiPreviewResponseSchema.js"
import { projectApiPreviewResponseSchema } from "./api/projectApiPreviewResponseSchema.js"
import { projectFileTabStateCreate } from "./projectFileTabStateCreate.js"

type ProjectEntry = ProjectApiDirectoryResponse["entries"][number]

type ProjectBrowserStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function parentPathResolve(path: string): string {
  const separator = path.lastIndexOf("/")
  return separator < 0 ? "" : path.slice(0, separator)
}

export function projectBrowserStateCreate(options: ProjectBrowserStateOptions = {}) {
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const [currentPath, setCurrentPath] = createSignal("")
  const [entries, setEntries] = createSignal<ProjectEntry[]>([])
  const [directoryStatus, setDirectoryStatus] = createSignal<"loading" | "complete" | "error">("loading")
  const [preview, setPreview] = createSignal<ProjectApiPreviewResponse | null>(null)
  const [previewStatus, setPreviewStatus] = createSignal<"idle" | "loading" | "complete" | "error">("idle")
  const fileTabs = projectFileTabStateCreate()
  let directoryController: AbortController | undefined
  let previewController: AbortController | undefined

  const requestUrl = (route: "directory" | "download" | "preview", path: string) =>
    `${apiBase}/${route}?path=${encodeURIComponent(path)}`

  const directoryLoad = (path: string) => {
    directoryController?.abort()
    const controller = new AbortController()
    directoryController = controller
    setDirectoryStatus("loading")

    void fetcher(requestUrl("directory", path), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The project directory request failed.")
        const parsed = v.safeParse(projectApiDirectoryResponseSchema, await response.json())
        if (!parsed.success) throw new Error("The project directory response is invalid.")
        if (controller.signal.aborted) return
        setCurrentPath(path)
        setEntries(parsed.output.entries)
        setDirectoryStatus("complete")
      })
      .catch((_error: unknown) => {
        if (controller.signal.aborted) return
        setDirectoryStatus("error")
      })
  }

  const previewLoad = (path: string) => {
    previewController?.abort()
    const controller = new AbortController()
    previewController = controller
    setPreview(null)
    setPreviewStatus("loading")

    void fetcher(requestUrl("preview", path), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The project preview request failed.")
        const parsed = v.safeParse(projectApiPreviewResponseSchema, await response.json())
        if (!parsed.success || parsed.output.path !== path) {
          throw new Error("The project preview response is invalid.")
        }
        if (controller.signal.aborted) return
        setPreview(parsed.output)
        setPreviewStatus("complete")
      })
      .catch((_error: unknown) => {
        if (controller.signal.aborted) return
        setPreviewStatus("error")
      })
  }

  const fileOpen = (entry: ProjectEntry) => {
    if (
      entry.type !== "file" ||
      !entries().some((candidate) => candidate.type === "file" && candidate.path === entry.path)
    ) {
      return
    }

    const opened = fileTabs.tabOpen(entry.path)
    if (!opened.success) return
    previewLoad(opened.data.path)
  }

  const directoryOpen = (entry: ProjectEntry) => {
    if (
      entry.type !== "directory" ||
      !entries().some((candidate) => candidate.type === "directory" && candidate.path === entry.path)
    ) {
      return
    }
    previewController?.abort()
    directoryLoad(entry.path)
  }

  directoryLoad("")
  onCleanup(() => directoryController?.abort())
  onCleanup(() => previewController?.abort())

  return {
    currentPath,
    directoryOpen,
    directoryStatus,
    downloadUrl: () => {
      const path = fileTabs.activePath()
      return path === null ? null : requestUrl("download", path)
    },
    entries,
    fileOpen,
    parentOpen: () => {
      if (currentPath() !== "") directoryLoad(parentPathResolve(currentPath()))
    },
    retryDirectory: () => directoryLoad(currentPath()),
    imagePreview: () => {
      const value = preview()
      return value?.kind === "image" ? value : null
    },
    pdfPreview: () => {
      const value = preview()
      return value?.kind === "pdf" ? value : null
    },
    preview,
    previewStatus,
    retryPreview: () => {
      const path = fileTabs.activePath()
      if (path !== null) previewLoad(path)
    },
    selectedFile: () => {
      const path = fileTabs.activePath()
      return path === null ? null : { name: path.split("/").at(-1) ?? path, path }
    },
    tabClose: (path: string) => {
      const wasActive = fileTabs.activePath() === path
      const closed = fileTabs.tabClose(path)
      if (!closed.success || !wasActive) return
      const activePath = fileTabs.activePath()
      if (activePath !== null) {
        previewLoad(activePath)
        return
      }
      previewController?.abort()
      setPreview(null)
      setPreviewStatus("idle")
    },
    tabSelect: (path: string) => {
      const selected = fileTabs.tabSelect(path)
      if (!selected.success) return
      previewLoad(path)
    },
    tabs: fileTabs.tabs,
    textPreview: () => {
      const value = preview()
      return value?.kind === "text" ? value : null
    },
  }
}

export type ProjectBrowserState = ReturnType<typeof projectBrowserStateCreate>
