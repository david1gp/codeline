import { onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"
import { projectApiDirectoryConfirmRequestSchema } from "../project/api/projectApiDirectoryConfirmRequestSchema.js"
import { projectApiDirectoryConfirmResponseSchema } from "../project/api/projectApiDirectoryConfirmResponseSchema.js"
import { projectApiDirectorySuggestionsResponseSchema } from "../project/api/projectApiDirectorySuggestionsResponseSchema.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type NewProjectDialogStateOptions = {
  activeProject: ActiveProjectState
  debounceMs?: number
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  idPrefix?: string
}

function projectApiErrorMessageResolve(body: unknown, fallback: string): string {
  const parsed = v.safeParse(apiErrorResponseSchema, body)
  return parsed.success ? parsed.output.error.message : fallback
}

export function newProjectDialogStateCreate(options: NewProjectDialogStateOptions) {
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

  const projectConfirm = async () => {
    if (confirmStatus.get() === "confirming" || disposed) return false
    const request = v.safeParse(projectApiDirectoryConfirmRequestSchema, { path: path.get() })
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
      const response = await fetchImplementation("/api/project/confirm", {
        body: JSON.stringify(request.output),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      })
      const body: unknown = await response.json()
      if (disposed || controller.signal.aborted) return false
      const parsed = v.safeParse(projectApiDirectoryConfirmResponseSchema, body)
      if (!response.ok || !parsed.success) {
        errorMessage.set(projectApiErrorMessageResolve(body, "Choose an existing project folder."))
        confirmStatus.set("error")
        return false
      }
      options.activeProject.projectActivate(parsed.output.project)
      path.set(parsed.output.project.path)
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

  return {
    confirmStatus: confirmStatus.get,
    errorMessage: errorMessage.get,
    formSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void projectConfirm()
    },
    helpId: `${idPrefix}-help`,
    inputId: `${idPrefix}-path`,
    open: open.get,
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
