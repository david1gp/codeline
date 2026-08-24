import { onCleanup, useContext } from "solid-js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryDataStatusResolve } from "../../ui/httpQueryDataStatusResolve.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteListQueryStateCreate } from "./noteListQueryStateCreate.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NotesScreenView } from "./notesScreenView.js"

type NotesPageStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
}

export function notesPageStateCreate(options: NotesPageStateOptions = {}): NotesScreenView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const fetcher = options.fetcher ?? fetch
  const noteList = noteListQueryStateCreate({
    fetcher,
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.isOnline === undefined ? {} : { isOnline: options.isOnline }),
  })
  const notesQuery = noteList.query
  const projectList = noteProjectListStateCreate({ apiBase: options.apiBase, fetcher })
  const revalidate = () => {
    notesQuery.refresh()
    projectList.revalidate()
  }
  const unregisterEventFeed = eventFeed?.registerNoteList(revalidate)
  if (unregisterEventFeed !== undefined) onCleanup(unregisterEventFeed)

  return {
    dataStatus: () => httpQueryDataStatusResolve({ isOnline: noteList.isOnline(), queries: [notesQuery] }),
    groups: () => noteGroupsDerive(noteList.notes(), projectList.projects()),
    isEmpty: () => notesQuery.isComplete() && noteList.notes().length === 0,
    isLoading: () => notesQuery.isLoading() && notesQuery.data() === undefined,
    isError: () => notesQuery.isError() && notesQuery.data() === undefined,
    refresh: revalidate,
    revalidate,
    retry: notesQuery.retry,
  }
}
