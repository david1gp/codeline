import { NoteWorkspacePage } from "../note/ui/NoteWorkspacePage.js"
import { noteWorkspaceScreenStateCreate } from "../note/ui/noteWorkspaceScreenStateCreate.js"
import { noteRoutePageStateCreate } from "./noteRoutePageStateCreate.js"

export function NoteRoutePage() {
  const route = noteRoutePageStateCreate()
  const state = noteWorkspaceScreenStateCreate({ noteId: route.noteId })
  return <NoteWorkspacePage state={state} />
}
