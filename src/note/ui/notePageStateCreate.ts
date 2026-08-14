import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useQuery, useZero } from "@rocicorp/zero/solid"
import { useNavigate } from "@solidjs/router"
import { createEffect } from "solid-js"
import type { zeroSchema } from "../../database/zeroSchema.js"
import { codelineQueries } from "../../ui/codelineQueries.js"
import { type NoteMutationContext, noteMutators } from "../noteMutators.js"
import { noteLineCount } from "./noteLineCount.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteProjectChoicesResolve } from "./noteProjectChoicesResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteScreenView } from "./noteScreenView.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

type NotePageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: string
}

export function notePageStateCreate(options: NotePageStateOptions): NoteScreenView {
  const navigate = useNavigate()
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const zero = useZero<typeof zeroSchema, undefined, NoteMutationContext>()
  const [note, noteResult] = useQuery(() => codelineQueries.note({ noteId: options.noteId }))

  const content = createSignalObject<string | null>(null)
  const projectId = createSignalObject<string | null>(null)
  const projectList = noteProjectListStateCreate({ apiBase, fetcher })
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const isDeleteConfirmOpen = createSignalObject(false)

  createEffect(() => {
    const loaded = note()
    if (loaded === undefined || content.get() !== null) return
    content.set(loaded.content)
    projectId.set(loaded.projectPath)
  })

  const noteSave = async () => {
    const current = note()
    const editedContent = content.get()
    if (current === undefined || editedContent === null || status.get() === "saving") return

    status.set("saving")
    const mutation = zero().mutate(
      noteMutators.note.update({
        id: current.id,
        content: editedContent,
        projectPath: projectId.get(),
        updatedAt: Date.now(),
      }),
    )
    const result = await mutation.client
    status.set(result.type === "error" ? "error" : "idle")
  }

  const viewModeState = noteViewModeStateCreate()
  const contentField = noteContentFieldStateCreate({
    content: () => content.get() ?? "",
    viewMode: viewModeState.viewMode,
  })
  const titleState = noteTitleStateCreate({ content: () => content.get() ?? "" })

  return {
    ...viewModeState,
    contentField,
    title: titleState.title,
    content: () => content.get() ?? "",
    contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
      content.set(event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    deleteConfirmClose: () => isDeleteConfirmOpen.set(false),
    deleteConfirmOpen: () => isDeleteConfirmOpen.set(true),
    deleteConfirm: async () => {
      const current = note()
      if (current === undefined || status.get() === "saving") return

      status.set("saving")
      const mutation = zero().mutate(noteMutators.note.delete(current.id))
      const result = await mutation.client
      if (result.type === "error") {
        status.set("error")
        isDeleteConfirmOpen.set(false)
        return
      }
      navigate("/notes")
    },
    hasError: () => status.get() === "error",
    hasNote: () => note() !== undefined,
    isDeleteConfirmOpen: isDeleteConfirmOpen.get,
    isDirty: () => {
      const current = note()
      if (current === undefined || content.get() === null) return false
      return content.get() !== current.content || projectId.get() !== current.projectPath
    },
    isLoading: () => noteResult().type === "unknown" && note() === undefined,
    isNotFound: () => noteResult().type === "complete" && note() === undefined,
    isSaving: () => status.get() === "saving",
    lineCount: () => noteLineCount(content.get() ?? ""),
    projectId: () => projectId.get() ?? "",
    projects: () => noteProjectChoicesResolve(projectList.projects(), projectId.get()),
    projectIdUpdate: (event: Event & { currentTarget: HTMLSelectElement }) => {
      projectId.set(event.currentTarget.value === "" ? null : event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    submit: async (event: SubmitEvent) => {
      event.preventDefault()
      await noteSave()
    },
  }
}
