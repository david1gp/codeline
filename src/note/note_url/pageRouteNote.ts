import type { PageNameNote } from "./pageNameNote.js"

export type PageRouteNote = keyof typeof pageRouteNote

export const pageRouteNote = {
  notes: "/notes",
  noteNew: "/notes/new",
  noteView: "/notes/:noteId",
} as const satisfies Record<PageNameNote, string>
