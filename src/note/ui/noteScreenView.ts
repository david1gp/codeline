import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import type { HttpQueryDataStatus } from "../../ui/httpQueryDataStatusResolve.js"
import type { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

/**
 * Rendering contract of the note detail screen, so production state and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type NoteScreenView = {
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  contentField: ReturnType<typeof noteContentFieldStateCreate>
  /** Retained-data lifecycle of the note representation backing this screen. */
  dataStatus: () => HttpQueryDataStatus
  deleteConfirm: () => void
  deleteConfirmClose: () => void
  deleteConfirmOpen: () => void
  hasError: () => boolean
  hasNote: () => boolean
  isDeleteConfirmOpen: () => boolean
  isDirty: () => boolean
  isLoading: () => boolean
  isNotFound: () => boolean
  isSaving: () => boolean
  lineCount: () => number
  projectId: () => string
  projectIdUpdate: (event: Event & { currentTarget: HTMLSelectElement }) => void
  projects: () => readonly ProjectRegistryApiProject[]
  submit: (event: SubmitEvent) => void
  title: () => string
  refresh: () => void
  revalidate: () => void
  viewMode: () => NoteViewMode
  viewModeSelect: (value: NoteViewMode) => void
}
