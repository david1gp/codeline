import { useContext } from "solid-js"
import { NoteWorkspacePage } from "./NoteWorkspacePage.js"
import { noteWorkspaceScreenStateCreate } from "./noteWorkspaceScreenStateCreate.js"
import { apiFetchContext } from "../../ui/apiFetchContext.js"
import { noteRoutePageStateCreate } from "./noteRoutePageStateCreate.js"

export function NoteRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const route = noteRoutePageStateCreate()
  const state = noteWorkspaceScreenStateCreate({ fetcher, noteId: route.noteId })
  return <NoteWorkspacePage state={state} />
}
