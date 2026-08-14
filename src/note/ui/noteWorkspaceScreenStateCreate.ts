import { notePageStateCreate } from "./notePageStateCreate.js"
import type { NoteWorkspaceScreenView } from "./noteWorkspaceScreenView.js"
import { noteWorkspacePageStateCreate } from "./noteWorkspacePageStateCreate.js"

export function noteWorkspaceScreenStateCreate(options: { noteId: () => string }): NoteWorkspaceScreenView {
  return {
    detail: notePageStateCreate({ noteId: options.noteId() }),
    sidebar: noteWorkspacePageStateCreate({ noteId: options.noteId }),
  }
}
