import { NotePage } from "../note/ui/NotePage.js"
import { noteRoutePageStateCreate } from "./noteRoutePageStateCreate.js"

export function NoteRoutePage() {
  const state = noteRoutePageStateCreate()
  return <NotePage noteId={state.noteId()} />
}
