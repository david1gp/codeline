import { onCleanup, useContext } from "solid-js"
import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteListFetch } from "../client/noteListFetch.js"
import { noteReorderRequest } from "../client/noteReorderRequest.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteMoveBoundsResolve } from "./noteMoveBoundsResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteWorkspaceSidebarView } from "./noteWorkspaceScreenView.js"

type NoteWorkspacePageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: () => string
}

export function noteWorkspacePageStateCreate(options: NoteWorkspacePageStateOptions): NoteWorkspaceSidebarView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const fetcher = options.fetcher ?? fetch
  const notesQuery = httpQueryStateCreate({
    key: () => "notes",
    load: (_key, signal) => noteListFetch({ fetch: fetcher, signal }),
  })
  const projectList = noteProjectListStateCreate({ apiBase: options.apiBase, fetcher })
  const notes = () => notesQuery.data() ?? []
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
    groups,
    isError: notesQuery.isError,
    isLoading: () => notesQuery.isLoading() && notes().length === 0,
    noteMoveDown: () => void noteMove("down"),
    noteMoveUp: () => void noteMove("up"),
    previewHtml: () => markdownHtmlRender(activeNote()?.content ?? ""),
    isPreviewEmpty: () => (activeNote()?.content ?? "").trim() === "",
    refresh: revalidate,
    revalidate,
    retry: notesQuery.retry,
  }
}
