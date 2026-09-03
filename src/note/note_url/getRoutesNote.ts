import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../../ui/routeConfig.js"
import { pageNameNote, type PageNameNote } from "./pageNameNote.js"
import { pageRouteNote } from "./pageRouteNote.js"

const NotesRoutePage = lazy(() =>
  import("../../ui/NotesRoutePage.js").then((c) => ({
    default: c.NotesRoutePage,
  })),
)

const NewNoteRoutePage = lazy(() =>
  import("../../ui/NewNoteRoutePage.js").then((c) => ({
    default: c.NewNoteRoutePage,
  })),
)

const NoteRoutePage = lazy(() =>
  import("../../ui/NoteRoutePage.js").then((c) => ({
    default: c.NoteRoutePage,
  })),
)

export function getRoutesNote(): RouteConfig {
  const routeMapping = {
    [pageNameNote.notes]: NotesRoutePage,
    [pageNameNote.noteNew]: NewNoteRoutePage,
    [pageNameNote.noteView]: NoteRoutePage,
  } as const satisfies Record<PageNameNote, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteNote[routeKey as PageNameNote],
    component,
  }))
}
