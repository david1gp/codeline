import type { NoteViewMode } from "./noteViewModeSchema.js"
import type { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"

/**
 * Rendering contract of the new-note screen, so production Zero state and demo
 * fixtures can supply the same shape without the view knowing the source.
 */
export type NewNoteScreenView = {
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  contentField: ReturnType<typeof noteContentFieldStateCreate>
  hasError: () => boolean
  isSaving: () => boolean
  submit: (event: SubmitEvent) => void
  title: () => string
  viewMode: () => NoteViewMode
  viewModeSelect: (value: NoteViewMode) => void
}
