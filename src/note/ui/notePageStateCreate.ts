import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useNavigate } from "@solidjs/router"
import { createEffect, onCleanup, useContext } from "solid-js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { NoteDetailResponse } from "../api/noteDetailResponseSchema.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteDeleteRequest } from "../client/noteDeleteRequest.js"
import { noteDetailFetch } from "../client/noteDetailFetch.js"
import { noteUpdateRequest } from "../client/noteUpdateRequest.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteLineCount } from "./noteLineCount.js"
import { noteProjectChoicesResolve } from "./noteProjectChoicesResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteScreenView } from "./noteScreenView.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

type NotePageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: string | (() => string)
}

export function notePageStateCreate(options: NotePageStateOptions): NoteScreenView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const navigate = useNavigate()
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const configuredNoteId = options.noteId
  const noteId = typeof configuredNoteId === "function" ? configuredNoteId : () => configuredNoteId
  const noteQuery = httpQueryStateCreate({
    key: noteId,
    load: (noteId, signal) => noteDetailFetch(noteId, { fetch: fetcher, signal }),
  })
  const content = createSignalObject<string | null>(null)
  const projectId = createSignalObject<string | null>(null)
  const projectList = noteProjectListStateCreate({ apiBase, fetcher })
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const isDeleteConfirmOpen = createSignalObject(false)
  const revalidate = () => {
    noteQuery.refresh()
    projectList.revalidate()
  }
  const unregisterEventFeed = eventFeed?.registerNoteDetail({ noteId, refresh: revalidate })
  if (unregisterEventFeed !== undefined) onCleanup(unregisterEventFeed)

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
    const result = await noteUpdateRequest(
      current.id,
      {
        content: editedContent,
        id: current.id,
        projectPath: projectId.get(),
        updatedAt: Date.now(),
      },
      { etag: noteEtag(current), fetch: fetcher },
    )
    if (!result.success) {
      status.set("error")
      return
    }
    content.set(result.data.content)
    projectId.set(result.data.projectPath)
    status.set("idle")
    noteQuery.refresh()
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
      void noteDeleteRequest(current.id, { etag: noteEtag(current), fetch: fetcher }).then((result) => {
        if (!result.success) {
          status.set("error")
          isDeleteConfirmOpen.set(false)
          return
        }
        noteQuery.refresh()
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
    refresh: revalidate,
    revalidate,
    submit: async (event) => {
      event.preventDefault()
      await noteSave()
    },
  }
}

function noteEtag(note: NoteDetailResponse): string {
  return noteRepresentationEtagCreate(note.id, note.revision)
}
