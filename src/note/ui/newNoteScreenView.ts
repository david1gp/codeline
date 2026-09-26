import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import type { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

/**
 * Rendering contract of the new-note screen, so production state and demo
 * fixtures can supply the same shape without the view knowing the source.
 */
export type NewNoteScreenView = {
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  contentField: ReturnType<typeof noteContentFieldStateCreate>
  hasError: () => boolean
  isSaving: () => boolean
  projectId: () => string
  projectIdUpdate: (event: Event & { currentTarget: HTMLSelectElement }) => void
  projects: () => readonly ProjectRegistryApiProject[]
  submit: (event: SubmitEvent) => void
  title: () => string
  viewMode: () => NoteViewMode
  viewModeSelect: (value: NoteViewMode) => void
}
