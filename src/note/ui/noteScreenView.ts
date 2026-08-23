import type { ProjectApiListResponse } from "../../project/api/projectApiListResponseSchema.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"
import type { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"

/**
 * Rendering contract of the note detail screen, so production state and
 * demo fixtures can supply the same shape without the view knowing the source.
 */
export type NoteScreenView = {
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  contentField: ReturnType<typeof noteContentFieldStateCreate>
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
  projects: () => ProjectApiListResponse["projects"]
  submit: (event: SubmitEvent) => void
  title: () => string
  refresh: () => void
  revalidate: () => void
  viewMode: () => NoteViewMode
  viewModeSelect: (value: NoteViewMode) => void
}
