import { pageRouteNote } from "./pageRouteNote.js"

export function urlNotes() {
  return pageRouteNote.notes
}

export function urlNoteNew() {
  return pageRouteNote.noteNew
}

export function urlNoteView(noteId: string) {
  return pageRouteNote.noteView.replace(":noteId", encodeURIComponent(noteId))
}
