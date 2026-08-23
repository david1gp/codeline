import { useContext } from "solid-js"
import { NoteWorkspacePage } from "../note/ui/NoteWorkspacePage.js"
import { noteWorkspaceScreenStateCreate } from "../note/ui/noteWorkspaceScreenStateCreate.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { noteRoutePageStateCreate } from "./noteRoutePageStateCreate.js"

export function NoteRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const route = noteRoutePageStateCreate()
  const state = noteWorkspaceScreenStateCreate({ fetcher, noteId: route.noteId })
  return <NoteWorkspacePage state={state} />
}
