import { createEffect, onCleanup, useContext } from "solid-js"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"
import { projectApiDirectorySuggestionsResponseSchema } from "../project/api/projectApiDirectorySuggestionsResponseSchema.js"
import { projectRegistryApiProjectResponseSchema } from "../project/api/projectRegistryApiProjectResponseSchema.js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import { projectRegistryRegisterRequestSchema } from "../project/api/projectRegistryRegisterRequestSchema.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type NewProjectDialogStateOptions = {
  activeProject: ActiveProjectState
  debounceMs?: number
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  idPrefix?: string
  onProjectConfirmed?: (projectPath: string, project?: ProjectRegistryApiProject) => void
  open?: () => boolean
  projectRegistry?: ProjectRegistryState
}

function projectApiErrorMessageResolve(body: unknown, fallback: string): string {
  const parsed = v.safeParse(apiErrorResponseSchema, body)
  return parsed.success ? parsed.output.error.message : fallback
}

export function newProjectDialogStateCreate(options: NewProjectDialogStateOptions) {
  const appShell = useContext(appShellContext)
  const projectRegistry = options.projectRegistry ?? appShell?.projectRegistry
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const debounceMs = options.debounceMs ?? 200
  const open = signalObjectCreate(false)
  const path = signalObjectCreate("")
  const suggestions = signalObjectCreate<
    v.InferOutput<typeof projectApiDirectorySuggestionsResponseSchema>["suggestions"]
  >([])
  const suggestionStatus = signalObjectCreate<"idle" | "loading" | "ready" | "error">("idle")
  const confirmStatus = signalObjectCreate<"idle" | "confirming" | "error">("idle")
  const errorMessage = signalObjectCreate<string | null>(null)
  const idPrefix = options.idPrefix ?? "new-project"
  let suggestionController: AbortController | undefined
  let confirmController: AbortController | undefined
  let suggestionTimer: ReturnType<typeof setTimeout> | undefined
  let suggestionVersion = 0
  let disposed = false

  const suggestionsLoad = async (query: string) => {
    const version = suggestionVersion + 1
    suggestionVersion = version
    suggestionController?.abort()
    const controller = new AbortController()
    suggestionController = controller
    suggestionStatus.set("loading")

    try {
      const response = await fetchImplementation(`/api/project/suggestions?path=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      const body: unknown = await response.json()
      if (disposed || controller.signal.aborted || version !== suggestionVersion) return
      const parsed = v.safeParse(projectApiDirectorySuggestionsResponseSchema, body)
      if (!response.ok || !parsed.success) {
        suggestions.set([])
        suggestionStatus.set("error")
        return
      }
      suggestions.set(parsed.output.suggestions)
      suggestionStatus.set("ready")
    } catch (_error) {
      if (disposed || controller.signal.aborted || version !== suggestionVersion) return
      suggestions.set([])
      suggestionStatus.set("error")
    }
  }

  const suggestionsSchedule = (query: string) => {
    if (suggestionTimer !== undefined) clearTimeout(suggestionTimer)
    suggestionController?.abort()
    suggestionVersion += 1
    if (debounceMs === 0) {
      void suggestionsLoad(query)
      return
    }
    suggestionTimer = setTimeout(() => void suggestionsLoad(query), debounceMs)
  }

  const pathChange = (value: string) => {
    if (confirmStatus.get() === "confirming") confirmController?.abort()
    path.set(value)
    errorMessage.set(null)
    confirmStatus.set("idle")
    suggestionsSchedule(value)
  }

  const openChange = (nextOpen: boolean) => {
    open.set(nextOpen)
    if (nextOpen) {
      errorMessage.set(null)
      confirmStatus.set("idle")
      suggestionsSchedule(path.get())
      return
    }
    if (suggestionTimer !== undefined) clearTimeout(suggestionTimer)
    suggestionController?.abort()
    confirmController?.abort()
  }

  let externalOpen: boolean | undefined
  createEffect(() => {
    const nextOpen = options.open?.()
    if (nextOpen === undefined || nextOpen === externalOpen) return
    externalOpen = nextOpen
    openChange(nextOpen)
  })

  const projectConfirm = async () => {
    if (confirmStatus.get() === "confirming" || disposed) return false
    const request = v.safeParse(projectRegistryRegisterRequestSchema, { path: path.get() })
    if (!request.success) {
      errorMessage.set("Enter a project folder path.")
      confirmStatus.set("error")
      return false
    }

    confirmController?.abort()
    const controller = new AbortController()
    confirmController = controller
    confirmStatus.set("confirming")
    errorMessage.set(null)
    try {
      const response = await fetchImplementation("/api/project/registry", {
        body: JSON.stringify(request.output),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      })
      const body: unknown = await response.json()
      if (disposed || controller.signal.aborted) return false
      const parsed = v.safeParse(projectRegistryApiProjectResponseSchema, body)
      if (!response.ok || !parsed.success) {
        errorMessage.set(projectApiErrorMessageResolve(body, "Choose an existing project folder."))
        confirmStatus.set("error")
        return false
      }
      options.activeProject.projectActivate({
        id: parsed.output.project.id,
        label: parsed.output.project.label,
        path: path.get(),
      })
      path.set(path.get())
      projectRegistry?.refresh()
      options.onProjectConfirmed?.(path.get(), parsed.output.project)
      confirmStatus.set("idle")
      openChange(false)
      return true
    } catch (_error) {
      if (disposed || controller.signal.aborted) return false
      errorMessage.set("The project folder could not be confirmed. Check the connection and try again.")
      confirmStatus.set("error")
      return false
    }
  }

  onCleanup(() => {
    disposed = true
    if (suggestionTimer !== undefined) clearTimeout(suggestionTimer)
    suggestionController?.abort()
    confirmController?.abort()
  })

  const openState = options.open ?? open.get

  return {
    confirmStatus: confirmStatus.get,
    errorMessage: errorMessage.get,
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void projectConfirm()
    },
    helpId: `${idPrefix}-help`,
    inputId: `${idPrefix}-path`,
    open: openState,
    openChange,
    path: path.get,
    pathChange,
    pathInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => pathChange(event.currentTarget.value),
    projectConfirm,
    suggestionClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
      const suggestionPath = event.currentTarget.dataset.path
      if (suggestionPath !== undefined) pathChange(suggestionPath)
    },
    suggestionSelect: pathChange,
    suggestions: suggestions.get,
    suggestionsId: `${idPrefix}-suggestions`,
    suggestionStatus: suggestionStatus.get,
  }
}

export type NewProjectDialogState = ReturnType<typeof newProjectDialogStateCreate>
