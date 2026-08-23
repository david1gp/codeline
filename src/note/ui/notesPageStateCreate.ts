import { onCleanup, useContext } from "solid-js"
import { eventFeedCoordinatorContext } from "../../ui/eventFeedCoordinatorContext.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import { noteListFetch } from "../client/noteListFetch.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NotesScreenView } from "./notesScreenView.js"

type NotesPageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function notesPageStateCreate(options: NotesPageStateOptions = {}): NotesScreenView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const fetcher = options.fetcher ?? fetch
  const notesQuery = httpQueryStateCreate({
    key: () => "notes",
    load: (_key, signal) => noteListFetch({ fetch: fetcher, signal }),
  })
  const projectList = noteProjectListStateCreate({ apiBase: options.apiBase, fetcher })
  const revalidate = () => {
    notesQuery.refresh()
    projectList.revalidate()
  }
  const unregisterEventFeed = eventFeed?.registerNoteList(revalidate)
  if (unregisterEventFeed !== undefined) onCleanup(unregisterEventFeed)

  return {
    groups: () => noteGroupsDerive(notesQuery.data() ?? [], projectList.projects()),
    isEmpty: () => notesQuery.isComplete() && (notesQuery.data()?.length ?? 0) === 0,
    isLoading: () => notesQuery.isLoading() && notesQuery.data() === undefined,
    isError: notesQuery.isError,
    refresh: revalidate,
    revalidate,
    retry: notesQuery.retry,
  }
}
