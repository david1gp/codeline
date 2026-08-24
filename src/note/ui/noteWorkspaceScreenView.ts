import type { HttpQueryDataStatus } from "../../ui/httpQueryDataStatusResolve.js"
import type { NoteScreenView } from "./noteScreenView.js"
import type { NotesScreenGroup } from "./notesScreenView.js"

export type NoteWorkspaceSidebarView = {
  activeNoteId: () => string
  activeProjectPath: () => string | null
  canMoveDown: () => boolean
  canMoveUp: () => boolean
  /** Retained-data lifecycle of the note list backing this sidebar. */
  dataStatus: () => HttpQueryDataStatus
  groups: () => readonly NotesScreenGroup[]
  isError: () => boolean
  isLoading: () => boolean
  isPreviewEmpty: () => boolean
  noteMoveDown: () => void
  noteMoveUp: () => void
  previewHtml: () => string
  refresh: () => void
  revalidate: () => void
  retry: () => void
}

/**
 * Rendering contract of the note workspace screen, pairing the navigation
 * sidebar with the note detail view so demo fixtures can supply both.
 */
export type NoteWorkspaceScreenView = {
  detail: NoteScreenView
  refresh: () => void
  revalidate: () => void
  sidebar: NoteWorkspaceSidebarView
}
