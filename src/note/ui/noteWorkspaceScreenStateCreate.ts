import { notePageStateCreate } from "./notePageStateCreate.js"
import { noteWorkspacePageStateCreate } from "./noteWorkspacePageStateCreate.js"
import type { NoteWorkspaceScreenView } from "./noteWorkspaceScreenView.js"

type NoteWorkspaceScreenStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: () => string
}

export function noteWorkspaceScreenStateCreate(options: NoteWorkspaceScreenStateOptions): NoteWorkspaceScreenView {
  const detail = notePageStateCreate({ apiBase: options.apiBase, fetcher: options.fetcher, noteId: options.noteId })
  const sidebar = noteWorkspacePageStateCreate({
    apiBase: options.apiBase,
    fetcher: options.fetcher,
    noteId: options.noteId,
  })
  const revalidate = () => {
    detail.revalidate()
    sidebar.revalidate()
  }

  return {
    detail,
    refresh: revalidate,
    revalidate,
    sidebar,
  }
}
