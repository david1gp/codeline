import type { HttpQueryDataStatus } from "../../ui/httpQueryDataStatusResolve.js"

export type NotesScreenNote = {
  content: string
  id: string
}

export type NotesScreenGroup = {
  label: string
  notes: readonly NotesScreenNote[]
  projectPath: string | null
}

/**
 * Rendering contract of the notes index screen, so production state and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type NotesScreenView = {
  /** Retained-data lifecycle of the note list backing this screen. */
  dataStatus: () => HttpQueryDataStatus
  groups: () => readonly NotesScreenGroup[]
  isEmpty: () => boolean
  isError: () => boolean
  isLoading: () => boolean
  refresh: () => void
  revalidate: () => void
  retry: () => void
}
