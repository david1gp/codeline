import { notePageStateCreate } from "./notePageStateCreate.js"
import { noteWorkspacePageStateCreate } from "./noteWorkspacePageStateCreate.js"
import type { NoteWorkspaceScreenView } from "./noteWorkspaceScreenView.js"

type NoteWorkspaceScreenStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  noteId: () => string
}

export function noteWorkspaceScreenStateCreate(options: NoteWorkspaceScreenStateOptions): NoteWorkspaceScreenView {
  // Both halves resolve the same account cache and online signal, so the shared
  // note-list representation is retained once rather than per screen half.
  const shared = {
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.isOnline === undefined ? {} : { isOnline: options.isOnline }),
  }
  const detail = notePageStateCreate({
    apiBase: options.apiBase,
    fetcher: options.fetcher,
    noteId: options.noteId,
    ...shared,
  })
  const sidebar = noteWorkspacePageStateCreate({
    apiBase: options.apiBase,
    fetcher: options.fetcher,
    noteId: options.noteId,
    ...shared,
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
