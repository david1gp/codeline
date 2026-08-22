import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { makeFunctionReference } from "convex/server"
import { useNavigate } from "@solidjs/router"
import { createEffect } from "solid-js"
import type { Result } from "@adaptive-ds/result"
import { codelineConvexMutationCreate } from "../../convex/codelineConvexMutationCreate.js"
import { codelineConvexQueryCreate } from "../../convex/codelineConvexQueryCreate.js"
import type { NoteRecord } from "../convex/noteRecord.js"
import { noteLineCount } from "./noteLineCount.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteProjectChoicesResolve } from "./noteProjectChoicesResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteScreenView } from "./noteScreenView.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

const noteDetailReference = makeFunctionReference<"query", Record<string, unknown>, Result<NoteRecord | undefined>>(
  "notes:noteDetail",
)
const noteUpdateReference = makeFunctionReference<"mutation", Record<string, unknown>, Result<NoteRecord>>(
  "notes:noteUpdate",
)
const noteDeleteReference = makeFunctionReference<"mutation", Record<string, unknown>, Result<NoteRecord>>(
  "notes:noteDelete",
)

type NotePageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: string
}

export function notePageStateCreate(options: NotePageStateOptions): NoteScreenView {
  const navigate = useNavigate()
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const noteQuery = codelineConvexQueryCreate<NoteRecord | undefined>(noteDetailReference, () => ({
    noteId: options.noteId,
  }))
  const noteUpdate = codelineConvexMutationCreate<NoteRecord>(noteUpdateReference)
  const noteDelete = codelineConvexMutationCreate<NoteRecord>(noteDeleteReference)
  const content = createSignalObject<string | null>(null)
  const projectId = createSignalObject<string | null>(null)
  const projectList = noteProjectListStateCreate({ apiBase, fetcher })
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const isDeleteConfirmOpen = createSignalObject(false)

  createEffect(() => {
    const loaded = noteQuery.data()
    if (loaded === undefined || content.get() !== null) return
    content.set(loaded.content)
    projectId.set(loaded.projectPath)
  })

  const noteSave = async () => {
    const current = noteQuery.data()
    const editedContent = content.get()
    if (current === undefined || editedContent === null || status.get() === "saving") return
    status.set("saving")
    const result = await noteUpdate({
      content: editedContent,
      id: current.id,
      projectPath: projectId.get(),
      updatedAt: Date.now(),
    })
    status.set(result.success ? "idle" : "error")
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
    contentUpdate: (event) => {
      content.set(event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    deleteConfirmClose: () => isDeleteConfirmOpen.set(false),
    deleteConfirmOpen: () => isDeleteConfirmOpen.set(true),
    deleteConfirm: () => {
      const current = noteQuery.data()
      if (current === undefined || status.get() === "saving") return
      status.set("saving")
      void noteDelete({ noteId: current.id }).then((result) => {
        if (!result.success) {
          status.set("error")
          isDeleteConfirmOpen.set(false)
          return
        }
        navigate("/notes")
      })
    },
    hasError: () => status.get() === "error" || noteQuery.isError(),
    hasNote: () => noteQuery.data() !== undefined,
    isDeleteConfirmOpen: isDeleteConfirmOpen.get,
    isDirty: () => {
      const current = noteQuery.data()
      return (
        current !== undefined &&
        content.get() !== null &&
        (content.get() !== current.content || projectId.get() !== current.projectPath)
      )
    },
    isLoading: () => noteQuery.isLoading() && noteQuery.data() === undefined,
    isNotFound: () => noteQuery.isComplete() && noteQuery.data() === undefined,
    isSaving: () => status.get() === "saving",
    lineCount: () => noteLineCount(content.get() ?? ""),
    projectId: () => projectId.get() ?? "",
    projects: () => noteProjectChoicesResolve(projectList.projects(), projectId.get()),
    projectIdUpdate: (event) => {
      projectId.set(event.currentTarget.value === "" ? null : event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    submit: async (event) => {
      event.preventDefault()
      await noteSave()
    },
  }
}
