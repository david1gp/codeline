import { useContext } from "solid-js"
import { NewNotePage } from "../note/ui/NewNotePage.js"
import { newNotePageStateCreate } from "../note/ui/newNotePageStateCreate.js"
import { apiFetchContext } from "./apiFetchContext.js"

export function NewNoteRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const state = newNotePageStateCreate({ fetcher })
  return <NewNotePage state={state} />
}
