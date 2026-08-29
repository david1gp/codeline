import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useNavigate } from "@solidjs/router"
import { createEffect, onCleanup, useContext } from "solid-js"
import type { ProjectRegistryState } from "../../project/ui/projectRegistryStateCreate.js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import { appShellContext } from "../../ui/appShellContext.js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryAccountCacheCreate } from "../../ui/httpQueryAccountCacheCreate.js"
import { httpQueryDataStatusResolve } from "../../ui/httpQueryDataStatusResolve.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { NoteDetailResponse } from "../api/noteDetailResponseSchema.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteDeleteRequest } from "../client/noteDeleteRequest.js"
import { noteDetailConditionalFetch } from "../client/noteDetailConditionalFetch.js"
import { noteUpdateRequest } from "../client/noteUpdateRequest.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteLineCount } from "./noteLineCount.js"
import { noteProjectChoicesResolve } from "./noteProjectChoicesResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteScreenView } from "./noteScreenView.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

type NotePageStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  noteId: string | (() => string)
  projectRegistry?: ProjectRegistryState
}

export function notePageStateCreate(options: NotePageStateOptions): NoteScreenView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const account = useContext(applicationAccountContext)
  const shell = useContext(appShellContext)
  const navigate = useNavigate()
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const configuredNoteId = options.noteId
  const noteId = typeof configuredNoteId === "function" ? configuredNoteId : () => configuredNoteId
  const isOnline = options.isOnline ?? (() => shell === undefined || shell.pwa.status() !== "offline")
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? account?.userId() ?? null)
  // The detail read shares the account revision/ETag cache, so a retained note
  // stays editable while a conditional revalidation is in flight or failing.
  const noteQuery = httpQueryStateCreate<NoteDetailResponse | undefined>({
    cache: accountCache.cache,
    key: () => accountCache.keyCreate(`/api/notes/${encodeURIComponent(noteId())}`),
    load: (_key, signal, cached) =>
      noteDetailConditionalFetch(noteId(), {
        fetch: fetcher,
        signal,
        ...(cached?.etag === undefined ? {} : { etag: cached.etag }),
      }),
  })
  const content = createSignalObject<string | null>(null)
  const projectId = createSignalObject<string | null>(null)
  const projectList = noteProjectListStateCreate({
    apiBase,
    fetcher,
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.projectRegistry === undefined ? {} : { projectRegistry: options.projectRegistry }),
  })
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
    projectId.set(loaded.projectId)
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
        projectId: projectId.get(),
        updatedAt: Date.now(),
      },
      { etag: noteEtag(current), fetch: fetcher },
    )
    if (!result.success) {
      status.set("error")
      return
    }
    content.set(result.data.content)
    projectId.set(result.data.projectId)
    status.set("idle")
    // The mutation response carries the authoritative revision; invalidating the
    // shared entry stops a stale conditional 304 from resurrecting the old note.
    noteQuery.invalidate(result.data.revision)
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
    dataStatus: () => httpQueryDataStatusResolve({ isOnline: isOnline(), queries: [noteQuery] }),
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
        accountCache.cache.clear(accountCache.keyCreate(`/api/notes/${encodeURIComponent(current.id)}`))
        noteQuery.refresh()
        navigate("/notes")
      })
    },
    hasError: () => status.get() === "error" || (noteQuery.isError() && noteQuery.data() === undefined),
    hasNote: () => noteQuery.data() !== undefined,
    isDeleteConfirmOpen: isDeleteConfirmOpen.get,
    isDirty: () => {
      const current = noteQuery.data()
      return (
        current !== undefined &&
        content.get() !== null &&
        (content.get() !== current.content || projectId.get() !== current.projectId)
      )
    },
    isLoading: () => noteQuery.isLoading() && noteQuery.data() === undefined,
    isNotFound: () => noteQuery.isComplete() && noteQuery.data() === undefined,
    isSaving: () => status.get() === "saving",
    lineCount: () => noteLineCount(content.get() ?? ""),
    projectId: () => projectId.get() ?? "",
    projects: () => noteProjectChoicesResolve(projectList.projects(), projectId.get(), noteQuery.data()?.projectPath),
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
