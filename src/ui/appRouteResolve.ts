import { pageRouteNote } from "../note/note_url/pageRouteNote.js"
import { urlNoteNew, urlNotes } from "../note/note_url/urlNote.js"
import { pageRouteFiles } from "./files_url/pageRouteFiles.js"
import { pageRouteSettings } from "./settings_url/pageRouteSettings.js"

const noteViewPrefix = pageRouteNote.noteView.replace(":noteId", "")

export function appRouteResolve(pathname: string): "files" | "note" | "notes" | "notes-new" | "settings" | "workspace" {
  if (pathname === pageRouteFiles.files) return "files"
  if (pathname === pageRouteSettings.settings) return "settings"
  if (pathname === urlNoteNew()) return "notes-new"
  if (pathname === urlNotes()) return "notes"
  if (pathname.startsWith(noteViewPrefix) && pathname.slice(noteViewPrefix.length) !== "") return "note"
  return "workspace"
}
