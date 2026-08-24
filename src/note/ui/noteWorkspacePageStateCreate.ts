import { onCleanup, useContext } from "solid-js"
import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryDataStatusResolve } from "../../ui/httpQueryDataStatusResolve.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteReorderRequest } from "../client/noteReorderRequest.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteListQueryStateCreate } from "./noteListQueryStateCreate.js"
import { noteMoveBoundsResolve } from "./noteMoveBoundsResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteWorkspaceSidebarView } from "./noteWorkspaceScreenView.js"

type NoteWorkspacePageStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  noteId: () => string
}

export function noteWorkspacePageStateCreate(options: NoteWorkspacePageStateOptions): NoteWorkspaceSidebarView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const fetcher = options.fetcher ?? fetch
  const noteList = noteListQueryStateCreate({
    fetcher,
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.isOnline === undefined ? {} : { isOnline: options.isOnline }),
  })
  const notesQuery = noteList.query
  const projectList = noteProjectListStateCreate({ apiBase: options.apiBase, fetcher })
  const notes = noteList.notes
  const groups = () => noteGroupsDerive(notes(), projectList.projects())
  const revalidate = () => {
    notesQuery.refresh()
    projectList.revalidate()
  }
  const unregisterEventFeed = eventFeed?.registerNoteList(revalidate)
  if (unregisterEventFeed !== undefined) onCleanup(unregisterEventFeed)
  const activeNote = () => notes().find((note) => note.id === options.noteId())
  const activeProjectPath = () => activeNote()?.projectPath ?? null
  const projectNotes = () => groups().find((group) => group.projectPath === activeProjectPath())?.notes ?? []
  const bounds = () => noteMoveBoundsResolve(projectNotes(), options.noteId())
  const noteMove = async (direction: "up" | "down") => {
    const current = activeNote()
    if (current === undefined) return
    if (direction === "up" ? !bounds().canMoveUp : !bounds().canMoveDown) return
    const result = await noteReorderRequest(
      current.id,
      { direction, id: current.id, projectPath: activeProjectPath() },
      { etag: noteRepresentationEtagCreate(current.id, current.revision), fetch: fetcher },
    )
    if (result.success) notesQuery.refresh()
  }

  return {
    activeNoteId: options.noteId,
    activeProjectPath,
    canMoveDown: () => bounds().canMoveDown,
    canMoveUp: () => bounds().canMoveUp,
    dataStatus: () => httpQueryDataStatusResolve({ isOnline: noteList.isOnline(), queries: [notesQuery] }),
    groups,
    isError: () => notesQuery.isError() && notesQuery.data() === undefined,
    isLoading: () => notesQuery.isLoading() && notesQuery.data() === undefined,
    noteMoveDown: () => void noteMove("down"),
    noteMoveUp: () => void noteMove("up"),
    previewHtml: () => markdownHtmlRender(activeNote()?.content ?? ""),
    isPreviewEmpty: () => (activeNote()?.content ?? "").trim() === "",
    refresh: revalidate,
    revalidate,
    retry: notesQuery.retry,
  }
}
